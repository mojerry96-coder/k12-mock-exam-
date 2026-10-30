// Connect-style API middleware shared by the Vite dev server and the production server.
//   /api/mock/*      exam lifecycle (server-authoritative timing, locking and marking)
//   /api/recognize   handwriting recognition (Mathpix adapter; 503 when not configured)
//   /api/health      which services are connected
// Each mutation reads its body first, then loads, changes and stores the attempt synchronously, so
// two overlapping requests can never act on the same stale copy.
import { createStore } from './store.mjs';
import { createRecognizer } from './recognize.mjs';
import { loadBank, buildExam, examSummary, DEFAULT_EXAM } from './exams.mjs';
import { createAttempt, saveDraft, submit, recordEvent, publicSnapshot, results } from './engine.mjs';

const MAX_BODY = 2 * 1024 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
};
const fail = (status, message) => Object.assign(new Error(message), { status });

export async function createApi(env = process.env, deps = {}) {
  const bank = deps.bank ?? await loadBank(env.QUESTION_BANK ?? new URL('../data/question-bank.json', import.meta.url));
  const store = deps.store ?? createStore(env.ATTEMPTS_DB ?? new URL('./runtime/attempts.sqlite', import.meta.url).pathname);
  const recognize = deps.recognize !== undefined ? deps.recognize : createRecognizer({ appId: env.MATHPIX_APP_ID, appKey: env.MATHPIX_APP_KEY });
  const multiplier = Math.max(1, Math.min(3, Number(env.TIME_MULTIPLIER) || 1));
  const marking = env.MARKING === 'queued' ? 'pending' : 'ready'; // queued = a human marks before results show
  const now = deps.now ?? Date.now;

  const auth = (req) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const attempt = store.load(token);
    if (!attempt) throw fail(401, 'Unknown attempt');
    return { token, attempt };
  };
  const snapshot = (a) => ({ ...publicSnapshot(a, now()), marking: a.status === 'complete' ? marking : null });

  return async function api(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    if (!path.startsWith('/api/')) return next?.();
    try {
      if (path === '/api/health' && req.method === 'GET') return send(res, 200, { exam: true, recognition: !!recognize });

      const examMatch = path.match(/^\/api\/mock\/exams\/([\w-]+)$/);
      if (examMatch && req.method === 'GET') {
        const exam = buildExam(bank, examMatch[1], { multiplier });
        return exam ? send(res, 200, examSummary(exam)) : send(res, 404, { error: 'No such exam' });
      }

      if (path === '/api/mock/start' && req.method === 'POST') {
        const body = await readJson(req);
        const exam = buildExam(bank, typeof body.examId === 'string' ? body.examId : DEFAULT_EXAM, { multiplier });
        if (!exam) return send(res, 404, { error: 'No such exam' });
        const attempt = createAttempt(exam.questions, { now: now(), exam: exam.meta });
        const token = store.create(attempt);
        return send(res, 200, { token, ...snapshot(attempt) });
      }

      if (path === '/api/recognize' && req.method === 'POST') {
        if (!recognize) return send(res, 503, { message: 'Handwriting recognition is not connected on this server. Your ink is saved; type your answer.' });
        const body = await readJson(req);
        auth(req); // only a candidate with a live attempt can use recognition
        if (!Array.isArray(body.strokes) || !body.strokes.length) return send(res, 400, { message: 'No strokes' });
        const ac = new AbortController();
        res.on('close', () => { if (!res.writableEnded) ac.abort(); });
        const out = await recognize({ strokes: body.strokes, bbox: body.bbox, signal: ac.signal });
        return send(res, 200, { ...out, requestId: body.requestId, revision: body.revision });
      }

      if (path.startsWith('/api/mock/')) {
        const body = req.method === 'POST' ? await readJson(req) : {};
        const { token, attempt: a } = auth(req);
        let extra = {};
        if (path === '/api/mock/current' && req.method === 'GET') { /* snapshot below applies elapsed deadlines */ }
        else if (path === '/api/mock/save' && req.method === 'POST') extra = saveDraft(a, body, now());
        else if (path === '/api/mock/submit' && req.method === 'POST') {
          try { submit(a, body.questionId, now()); } catch (e) { store.save(token, a); throw fail(409, e.message); }
        } else if (path === '/api/mock/event' && req.method === 'POST') recordEvent(a, body.kind, now());
        else if (path === '/api/mock/result' && req.method === 'GET') {
          const snap = snapshot(a);
          store.save(token, a);
          if (a.status !== 'complete') return send(res, 403, { error: 'Finish the exam first' });
          if (marking === 'pending') return send(res, 202, { attemptId: a.id, status: 'pending' });
          return send(res, 200, { attemptId: a.id, status: 'ready', exam: snap.exam, results: results(a), marking: 'demo-final-answer-only', xp: null });
        } else return send(res, 404, { error: 'Not found' });
        const snap = snapshot(a);
        store.save(token, a);
        return send(res, 200, { ...snap, ...extra });
      }
      return send(res, 404, { error: 'Not found' });
    } catch (e) {
      if (e.status && e.status < 500) return send(res, e.status, { error: e.message, message: e.message });
      console.error('[api]', path, e);
      return send(res, 502, { error: 'Service unavailable. Your work is safe on this device.' });
    }
  };
}

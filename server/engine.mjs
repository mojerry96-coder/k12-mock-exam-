// Server-authoritative mock exam engine. Pure functions over a plain attempt object, so the HTTP
// layer, the tests and any future store share one set of timing and locking rules.
//
// Rules (docs/PAGES_AND_STATES.md in the source pack):
// - every question has an absolute deadline set here, never by the client;
// - submitting early starts the next question at submission time; expiry starts it at the expired
//   deadline, so time away (offline, background, closed tab) can use up several questions;
// - a question locks with the last draft the server accepted, and a late or stale save is refused;
// - answer keys and explanations never leave the server until the attempt is complete.
import { randomUUID } from 'node:crypto';

export const WORLD = 1000; // ink is stored in sheet units: the sheet is WORLD wide (see src/lib/ink.js)
const LIMITS = { answer: 500, line: 400, lines: 60, strokes: 600, points: 4000, conversions: 60 };

export const emptyDraft = () => ({ answer: '', lines: [], strokes: [], conversions: [] });

export function createAttempt(questions, { now = Date.now(), exam = null } = {}) {
  if (!questions.length) throw Error('No questions');
  return {
    id: randomUUID(), status: 'active', exam, index: 0, questions, responses: [],
    draft: emptyDraft(), revision: 0, startedAt: now, questionStartedAt: now,
    deadline: now + questions[0].seconds * 1000, events: [],
  };
}

// Plain-text record of the working for review: typed lines, then converted handwriting top to bottom.
export function workingText(draft) {
  const converted = [...(draft.conversions ?? [])].sort((a, b) => a.box.y - b.box.y).map((c) => c.text);
  return [...(draft.lines ?? []), ...converted].filter((t) => t.trim()).join('\n');
}

function finishQuestion(a, reason, now) {
  const q = a.questions[a.index];
  a.responses.push({
    questionId: q.id, subject: q.subject, answer: a.draft.answer, working: workingText(a.draft),
    lines: a.draft.lines, strokes: a.draft.strokes, conversions: a.draft.conversions,
    reason, startedAt: a.questionStartedAt, lockedAt: now,
  });
  a.index++;
  a.revision = 0;
  a.draft = emptyDraft();
  if (a.index === a.questions.length) { a.status = 'complete'; a.completedAt = now; a.deadline = null; }
  else { a.questionStartedAt = now; a.deadline = now + a.questions[a.index].seconds * 1000; }
}

export function expire(a, now = Date.now()) {
  while (a.status === 'active' && now >= a.deadline) finishQuestion(a, 'expired', a.deadline);
  return a;
}

const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 10) / 10)) : null);
const str = (v, max) => String(v ?? '').slice(0, max);

// Never trust the shape of a client draft: clamp sizes and coordinates, drop anything unexpected.
export function sanitizeDraft(d = {}) {
  const strokes = (Array.isArray(d.strokes) ? d.strokes : []).slice(0, LIMITS.strokes).filter(Array.isArray).map((s) =>
    s.slice(0, LIMITS.points).map((p) => p && { x: num(p.x, 0, WORLD), y: num(p.y, 0, WORLD * 4), p: num(p.p ?? 0.5, 0, 1) ?? 0.5 })
      .filter((p) => p && p.x !== null && p.y !== null)).filter((s) => s.length);
  const conversions = (Array.isArray(d.conversions) ? d.conversions : []).slice(0, LIMITS.conversions).map((c) => ({
    id: str(c?.id, 40),
    text: str(c?.text, LIMITS.line),
    from: Math.max(0, Math.floor(Number(c?.from) || 0)),
    to: Math.max(0, Math.floor(Number(c?.to) || 0)),
    box: { x: num(c?.box?.x, 0, WORLD) ?? 0, y: num(c?.box?.y, 0, WORLD * 4) ?? 0, w: num(c?.box?.w, 0, WORLD) ?? 0, h: num(c?.box?.h, 0, WORLD * 4) ?? 0 },
  })).filter((c) => c.id && c.to >= c.from && c.to <= strokes.length);
  return {
    answer: str(d.answer, LIMITS.answer),
    lines: (Array.isArray(d.lines) ? d.lines : []).slice(0, LIMITS.lines).map((l) => str(l, LIMITS.line)),
    strokes,
    conversions,
  };
}

export function saveDraft(a, { questionId, revision, draft }, now = Date.now()) {
  expire(a, now);
  if (a.status !== 'active' || a.questions[a.index].id !== questionId) return { accepted: false, reason: 'locked' };
  if (!Number.isInteger(revision) || revision <= a.revision) return { accepted: false, reason: 'stale' };
  a.draft = sanitizeDraft(draft);
  a.revision = revision;
  return { accepted: true };
}

export function submit(a, questionId, now = Date.now()) {
  expire(a, now);
  if (a.responses.some((r) => r.questionId === questionId)) return a; // a retried submit never advances twice
  if (a.status !== 'active' || a.questions[a.index].id !== questionId) throw Error('Question mismatch');
  finishQuestion(a, 'submitted', now);
  return a;
}

export function recordEvent(a, kind, now = Date.now()) {
  a.events.push({ kind: str(kind, 40), at: now, questionId: a.questions[a.index]?.id ?? null });
  a.events = a.events.slice(-500);
}

const PRIVATE = new Set(['answer', 'explanation', 'source']);
export const publicQuestion = (q) => (q ? Object.fromEntries(Object.entries(q).filter(([k]) => !PRIVATE.has(k))) : null);

export function publicSnapshot(a, now = Date.now()) {
  expire(a, now);
  return {
    id: a.id, status: a.status, exam: a.exam, index: a.index, total: a.questions.length,
    question: publicQuestion(a.questions[a.index]), draft: a.draft, revision: a.revision,
    deadline: a.deadline, serverNow: now, completedAt: a.completedAt ?? null,
    submitted: a.responses.filter((r) => r.reason === 'submitted').length,
    expired: a.responses.filter((r) => r.reason === 'expired').length,
    answered: a.responses.filter((r) => r.answer.trim()).length,
    subjects: [...new Set(a.questions.map((q) => q.subject))],
    topics: [...new Set(a.questions.map((q) => q.topic))],
  };
}

// Numeric final answers: an integer, decimal or one simple fraction, signed. Nothing is evaluated.
export function numberValue(s) {
  s = String(s).trim().replaceAll('−', '-').replace(/^\((.*)\)$/, '$1');
  const n = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  const m = s.match(new RegExp(`^\\(?(${n})\\)?(?:\\s*\\/\\s*\\(?(${n})\\)?)?$`));
  if (!m) return NaN;
  const d = m[2] === undefined ? 1 : Number(m[2]);
  return d === 0 ? NaN : Number(m[1]) / d;
}

export function results(a) {
  if (a.status !== 'complete') throw Error('Results unavailable during exam');
  return a.responses.map((r) => {
    const q = a.questions.find((x) => x.id === r.questionId);
    const correct = q.type === 'number'
      ? Number.isFinite(numberValue(r.answer)) && Math.abs(numberValue(r.answer) - numberValue(q.answer)) < 1e-9
      : r.answer === q.answer;
    return {
      questionId: r.questionId, subject: r.subject, topic: q.topic, prompt: q.prompt, type: q.type,
      answer: r.answer, working: r.working, reason: r.reason, correct, marks: correct ? q.marks : 0,
      maxMarks: q.marks, expected: q.answer, explanation: q.explanation,
    };
  });
}

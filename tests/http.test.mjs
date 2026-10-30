// HTTP integration: the API middleware over a real socket, an in-memory store and a controllable clock.
import { test, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createApi } from '../server/api.mjs';
import { createStore } from '../server/store.mjs';

let server, base, clock = 1_000_000;
const recognized = [];
beforeAll(async () => {
  const api = await createApi({}, {
    store: createStore(':memory:'), now: () => clock,
    recognize: async ({ strokes }) => { recognized.push(strokes.length); return { expression: 'm=4/2', latex: '', confidence: 0.9, alternatives: [] }; },
  });
  server = http.createServer((req, res) => api(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server.close());

const call = async (path, { token, body } = {}) => {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

test('exam summary shows size and timing only, never content', async () => {
  const { status, body } = await call('/api/mock/exams/gradient-challenge');
  expect(status).toBe(200);
  expect(body).toMatchObject({ label: 'Mathematics mock', title: 'Gradient challenge', count: 2, minSeconds: 120, maxSeconds: 120 });
  expect(JSON.stringify(body)).not.toMatch(/gradient of the line|answer/i);
  expect((await call('/api/mock/exams/unknown')).status).toBe(404);
});

test('start → save → submit → expiry → gated review, with keys hidden until complete', async () => {
  const start = await call('/api/mock/start', { body: { examId: 'gradient-challenge' } });
  expect(start.status).toBe(200);
  const { token } = start.body;
  expect(start.body.question.id).toBe('MAT-001');
  expect(start.body.question.answer).toBeUndefined();
  expect(start.body.deadline).toBe(clock + 120_000);
  expect((await call('/api/mock/result', { token })).status).toBe(403);

  const save = await call('/api/mock/save', { token, body: { questionId: 'MAT-001', revision: 1, draft: { answer: '2', lines: ['m=(6-2)/(3-1)'] } } });
  expect(save.body.accepted).toBe(true);
  const stale = await call('/api/mock/save', { token, body: { questionId: 'MAT-001', revision: 1, draft: { answer: '9' } } });
  expect(stale.body).toMatchObject({ accepted: false, reason: 'stale', revision: 1 });

  clock += 30_000;
  const next = await call('/api/mock/submit', { token, body: { questionId: 'MAT-001' } });
  expect(next.body).toMatchObject({ index: 1, submitted: 1 });
  expect(next.body.deadline).toBe(clock + 120_000);
  const retry = await call('/api/mock/submit', { token, body: { questionId: 'MAT-001' } });
  expect(retry.body.index).toBe(1); // idempotent

  expect((await call('/api/recognize', { token, body: { strokes: [{ x: [1, 2], y: [3, 4] }] } })).body.expression).toBe('m=4/2');
  expect(recognized).toEqual([1]);

  clock += 121_000; // away past the second deadline
  const late = await call('/api/mock/save', { token, body: { questionId: 'MAT-002', revision: 1, draft: { answer: '-3' } } });
  expect(late.body).toMatchObject({ accepted: false, reason: 'locked', status: 'complete', expired: 1, marking: 'ready' });

  const review = await call('/api/mock/result', { token });
  expect(review.status).toBe(200);
  expect(review.body.results.map((r) => [r.questionId, r.correct, r.reason])).toEqual([['MAT-001', true, 'submitted'], ['MAT-002', false, 'expired']]);
  expect(review.body.results[0].working).toBe('m=(6-2)/(3-1)');
  expect(review.body.xp).toBeNull();
});

test('unknown or missing tokens are refused, and recognition needs a live attempt', async () => {
  expect((await call('/api/mock/current')).status).toBe(401);
  expect((await call('/api/mock/current', { token: 'nope' })).status).toBe(401);
  expect((await call('/api/recognize', { body: { strokes: [{ x: [1], y: [1] }] } })).status).toBe(401);
  expect((await call('/api/mock/start', { body: { examId: 'nope' } })).status).toBe(404);
});

test('without a recognition service the server says so instead of guessing', async () => {
  const api = await createApi({}, { store: createStore(':memory:'), recognize: null });
  const s = http.createServer((req, res) => api(req, res));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${s.address().port}`;
  const health = await (await fetch(`${url}/api/health`)).json();
  expect(health).toEqual({ exam: true, recognition: false });
  const r = await fetch(`${url}/api/recognize`, { method: 'POST', body: '{}' });
  expect(r.status).toBe(503);
  s.close();
});

test('queued marking keeps results pending after completion', async () => {
  const api = await createApi({ MARKING: 'queued' }, { store: createStore(':memory:') });
  const s = http.createServer((req, res) => api(req, res));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${s.address().port}`;
  const post = (p, body, token) => fetch(url + p, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }).then((r) => r.json());
  const start = await post('/api/mock/start', { examId: 'gradient-challenge' });
  await post('/api/mock/submit', { questionId: 'MAT-001' }, start.token);
  const done = await post('/api/mock/submit', { questionId: 'MAT-002' }, start.token);
  expect(done).toMatchObject({ status: 'complete', marking: 'pending' });
  const res = await fetch(`${url}/api/mock/result`, { headers: { Authorization: `Bearer ${start.token}` } });
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ attemptId: done.id, status: 'pending' });
  s.close();
});

test('the picker lists the subjects, and a learner gets new questions every attempt until all 30 are used', async () => {
  const list = await call('/api/mock/exams');
  expect(list.body.exams.map((e) => e.id)).toEqual(['mathematics', 'english', 'biology', 'mixed']);
  expect(list.body.defaultExam).toBe('mathematics');
  const learner = 'device-123';
  const ids = [];
  for (let i = 0; i < 15; i++) {
    const s = await call('/api/mock/start', { body: { examId: 'mathematics', learner } });
    const qs = [s.body.question.id];
    await call('/api/mock/submit', { token: s.body.token, body: { questionId: qs[0] } });
    const second = await call('/api/mock/current', { token: s.body.token });
    qs.push(second.body.question.id);
    expect(s.body.total).toBe(2);
    ids.push(...qs);
  }
  expect(new Set(ids).size).toBe(30); // 15 attempts × 2 = every maths question once, no repeats
  expect(ids.every((id) => id.startsWith('MAT-'))).toBe(true);
  const sixteenth = await call('/api/mock/start', { body: { examId: 'mathematics', learner } });
  expect(ids.slice(0, 2)).toContain(sixteenth.body.question.id); // then the longest-ago ones come back
});

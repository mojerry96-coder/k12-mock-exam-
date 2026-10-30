// Client session: autosave ordering, retries, offline backup, clock sync, expiry and completion.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExamSession, emptyDraft } from '../src/lib/session.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const snap = (over = {}) => ({ id: 'a1', status: 'active', index: 0, total: 2, question: { id: 'q1', type: 'number' }, draft: emptyDraft(), revision: 0, deadline: 120_000, serverNow: 0, submitted: 0, expired: 0, ...over });

let t, clock;
beforeEach(() => { vi.useFakeTimers(); t = 0; clock = () => t; });
afterEach(() => vi.useRealTimers());

function fakeApi(over = {}) {
  return {
    start: vi.fn(async () => snap()), current: vi.fn(async () => snap()), clear: vi.fn(),
    save: vi.fn(async ({ revision, draft }) => ({ ...snap({ revision, draft }), accepted: true })),
    submit: vi.fn(async () => snap({ index: 1, question: { id: 'q2', type: 'number' }, deadline: 240_000, submitted: 1 })),
    event: vi.fn(async () => ({})), ...over,
  };
}

test('the clock follows server time, not the device clock', async () => {
  const s = new ExamSession({ api: fakeApi({ start: async () => snap({ serverNow: 100_000, deadline: 220_000 }) }), storage: memory(), clock });
  await s.start('x');
  expect(s.remaining()).toBe(120_000);
  t = 30_000;
  expect(s.remaining()).toBe(90_000);
  s.detach();
});

test('edits are debounced, saved in order with rising revisions, then marked saved', async () => {
  const api = fakeApi();
  const s = new ExamSession({ api, storage: memory(), clock });
  await s.start('x');
  s.edit((d) => ({ ...d, answer: '2' }));
  s.edit((d) => ({ ...d, lines: ['m=4/2'] }));
  expect(s.state.save).toBe('Saving…');
  await vi.advanceTimersByTimeAsync(460);
  expect(api.save).toHaveBeenCalledTimes(1);
  expect(api.save.mock.calls[0][0]).toMatchObject({ questionId: 'q1', revision: 1, draft: { answer: '2', lines: ['m=4/2'] } });
  expect(s.state.save).toBe('Saved');
  s.edit((d) => ({ ...d, answer: '3' }));
  await vi.advanceTimersByTimeAsync(460);
  expect(api.save.mock.calls[1][0].revision).toBe(2);
  s.detach();
});

test('a stale save retries above the server revision', async () => {
  let first = true;
  const api = fakeApi({ save: vi.fn(async ({ revision, draft }) => {
    if (first) { first = false; return { ...snap({ revision: 5 }), accepted: false, reason: 'stale' }; }
    return { ...snap({ revision, draft }), accepted: true };
  }) });
  const s = new ExamSession({ api, storage: memory(), clock });
  await s.start('x');
  s.edit((d) => ({ ...d, answer: '2' }));
  await vi.advanceTimersByTimeAsync(460);
  expect(s.state.save).toBe('Retrying save…');
  await vi.advanceTimersByTimeAsync(200);
  expect(api.save.mock.calls[1][0].revision).toBe(6);
  expect(s.state.save).toBe('Saved');
  s.detach();
});

test('offline: the draft is kept on the device and restored on resume for the same open question', async () => {
  const storage = memory();
  const api = fakeApi({ save: vi.fn(async () => { throw new Error('offline'); }) });
  const s = new ExamSession({ api, storage, clock });
  await s.start('x');
  s.edit((d) => ({ ...d, answer: '7' }));
  await vi.advanceTimersByTimeAsync(460);
  expect(s.state.save).toBe('Offline · saved on this device');
  s.detach();

  const api2 = fakeApi({ current: async () => snap() });
  const s2 = new ExamSession({ api: api2, storage, clock });
  await s2.resume();
  expect(s2.state.draft.answer).toBe('7');
  await vi.advanceTimersByTimeAsync(10);
  expect(api2.save).toHaveBeenCalled(); // the recovered draft is sent straight away
  s2.detach();

  // …but never into a question that has moved on
  const s3 = new ExamSession({ api: fakeApi({ current: async () => snap({ index: 1, question: { id: 'q2' } }) }), storage, clock });
  await s3.resume();
  expect(s3.state.draft.answer).toBe('');
  s3.detach();
});

test('when time ends elsewhere the question moves on with a notice; older snapshots are ignored', async () => {
  const s = new ExamSession({ api: fakeApi(), storage: memory(), clock });
  await s.start('x');
  s.accept(snap({ index: 1, question: { id: 'q2' }, deadline: 240_000, serverNow: 120_000, expired: 1 }));
  expect(s.state.snap.question.id).toBe('q2');
  expect(s.state.notice).toMatch(/Time ended for question 1/);
  s.accept(snap()); // a slow poll from before
  expect(s.state.snap.question.id).toBe('q2');
  s.accept(snap({ index: 2, status: 'complete', question: null, deadline: null, serverNow: 999_000 }));
  expect(s.state.phase).toBe('complete');
  s.detach();
});

test('input stops at zero and the server is asked straight away', async () => {
  const api = fakeApi();
  const s = new ExamSession({ api, storage: memory(), clock });
  await s.start('x');
  t = 120_000;
  s.tick();
  expect(s.state.timeUp).toBe(true);
  expect(s.edit((d) => ({ ...d, answer: '1' }))).toBe(false);
  await vi.advanceTimersByTimeAsync(400);
  expect(api.current).toHaveBeenCalled();
  s.detach();
});

test('submit saves first, refuses while a save cannot reach the server, and completion is reported once', async () => {
  const onComplete = vi.fn();
  const storage = memory();
  let online = false;
  const api = fakeApi({
    save: vi.fn(async ({ revision, draft }) => { if (!online) throw new Error('offline'); return { ...snap({ revision, draft }), accepted: true }; }),
    submit: vi.fn(async () => snap({ index: 2, status: 'complete', question: null, deadline: null, submitted: 2 })),
  });
  const s = new ExamSession({ api, storage, clock, onComplete });
  await s.start('x');
  s.edit((d) => ({ ...d, answer: '2' }));
  const blocked = await s.submit();
  expect(blocked).toMatchObject({ ok: false });
  expect(blocked.error).toMatch(/Reconnect/);
  expect(api.submit).not.toHaveBeenCalled();
  online = true;
  expect((await s.submit()).ok).toBe(true);
  expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({ draft: expect.objectContaining({ answer: '2' }) }));
  expect(s.state.phase).toBe('complete');
  s.accept(snap({ index: 2, status: 'complete', question: null, deadline: null, revision: 0 }));
  const again = new ExamSession({ api: fakeApi({ current: async () => snap({ status: 'complete', question: null }) }), storage, clock, onComplete });
  await again.resume();
  expect(onComplete).toHaveBeenCalledTimes(1);
  s.detach(); again.detach();
});

test('retake: reset returns to preparation and a new start opens a fresh attempt', async () => {
  let n = 0;
  const api = fakeApi({ start: vi.fn(async () => snap({ id: `a${++n}` })) });
  const s = new ExamSession({ api, storage: memory(), clock });
  await s.start('x');
  s.accept(snap({ id: 'a1', index: 2, status: 'complete', question: null, deadline: null }));
  expect(s.state.phase).toBe('complete');
  s.reset();
  expect(s.state).toMatchObject({ phase: 'prepare', snap: null });
  await s.start('x');
  expect(s.state.snap.id).toBe('a2');
  expect(s.state.phase).toBe('exam');
  s.detach();
});

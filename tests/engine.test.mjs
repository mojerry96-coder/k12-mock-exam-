// Server timing, locking and marking rules (ported from the source pack's engine tests, extended).
import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createAttempt, expire, saveDraft, submit, publicSnapshot, results, numberValue, sanitizeDraft, workingText } from '../server/engine.mjs';
import { buildExam, examSummary, EXAMS } from '../server/exams.mjs';

const qs = [1, 2, 3].map((n) => ({ id: `q${n}`, subject: 'Mathematics', topic: 'Gradient', seconds: 10, type: 'number', answer: '2', explanation: 'key', marks: 1, source: { kind: 'original-placeholder' } }));
const draft = (answer, extra = {}) => ({ answer, lines: [], strokes: [], conversions: [], ...extra });

test('a deadline locks the last acknowledged draft and refuses a late edit', () => {
  const a = createAttempt(qs, { now: 0 });
  expect(saveDraft(a, { questionId: 'q1', revision: 1, draft: draft('2') }, 9000).accepted).toBe(true);
  expect(saveDraft(a, { questionId: 'q1', revision: 2, draft: draft('9') }, 10000).reason).toBe('locked');
  expect(a.responses[0].answer).toBe('2');
  expect(a.responses[0].reason).toBe('expired');
  expect(a.index).toBe(1);
  expect(a.deadline).toBe(20000); // the next question started at the expired deadline
});

test('a stale revision cannot overwrite a newer response', () => {
  const a = createAttempt(qs, { now: 0 });
  saveDraft(a, { questionId: 'q1', revision: 2, draft: draft('2') }, 1);
  expect(saveDraft(a, { questionId: 'q1', revision: 1, draft: draft('9') }, 2).reason).toBe('stale');
  expect(a.draft.answer).toBe('2');
});

test('a retried submit never advances twice, and early submission starts the next clock then', () => {
  const a = createAttempt(qs, { now: 0 });
  submit(a, 'q1', 100);
  submit(a, 'q1', 200);
  expect(a.index).toBe(1);
  expect(a.deadline).toBe(10100);
  expect(() => submit(a, 'q3', 300)).toThrow('Question mismatch');
});

test('time away runs through every expired question', () => {
  const a = createAttempt(qs, { now: 0 });
  expire(a, 35000);
  expect(a.status).toBe('complete');
  expect(a.responses.map((r) => r.reason)).toEqual(['expired', 'expired', 'expired']);
  expect(a.completedAt).toBe(30000);
});

test('active snapshots never carry answer keys, explanations or provenance; results wait for completion', () => {
  const a = createAttempt(qs, { now: 0 });
  const s = publicSnapshot(a, 1);
  expect(s.question.answer).toBeUndefined();
  expect(s.question.explanation).toBeUndefined();
  expect(s.question.source).toBeUndefined();
  expect(() => results(a)).toThrow();
});

test('numeric marking: integers, decimals, signed values and one simple fraction; nothing is evaluated', () => {
  expect(numberValue('4/2')).toBe(2);
  expect(numberValue('−15/5')).toBe(-3);
  expect(numberValue('(-15)/5')).toBe(-3);
  expect(numberValue('0.5')).toBe(0.5);
  expect(numberValue('2+2')).toBeNaN();
  expect(numberValue('1/0')).toBeNaN();
  expect(numberValue('(6-2)/(3-1)')).toBeNaN();
  const a = createAttempt([qs[0]], { now: 0 });
  saveDraft(a, { questionId: 'q1', revision: 1, draft: draft('4/2') }, 1);
  submit(a, 'q1', 2);
  expect(results(a)[0]).toMatchObject({ correct: true, marks: 1, expected: '2' });
});

test('drafts are sanitised: ink is clamped to the sheet and conversions must point at real strokes', () => {
  const d = sanitizeDraft({
    answer: 'x'.repeat(900), lines: ['m=2', 7],
    strokes: [[{ x: -5, y: 20, p: 3 }, { x: 2000, y: 9999 }, { x: 'a', y: 1 }], 'bad'],
    conversions: [{ id: 'c1', text: 'm=2', from: 0, to: 1, box: { x: 1, y: 2, w: 3, h: 4 } }, { id: 'c2', text: 'x', from: 0, to: 9, box: {} }],
  });
  expect(d.answer).toHaveLength(500);
  expect(d.lines).toEqual(['m=2', '7']);
  expect(d.strokes).toEqual([[{ x: 0, y: 20, p: 1 }, { x: 1000, y: 4000, p: 0.5 }]]);
  expect(d.conversions.map((c) => c.id)).toEqual(['c1']);
  expect(workingText({ lines: ['m = 4/2'], conversions: [{ text: 'b', box: { y: 50 } }, { text: 'a', box: { y: 10 } }] })).toBe('m = 4/2\na\nb');
});

test('locked responses keep typed working, ink and converted handwriting for review', () => {
  const a = createAttempt([qs[0]], { now: 0 });
  const strokes = [[{ x: 10, y: 10 }, { x: 20, y: 20 }]];
  saveDraft(a, { questionId: 'q1', revision: 1, draft: draft('2', { lines: ['m=(6-2)/(3-1)'], strokes, conversions: [{ id: 'c1', text: 'm=4/2', from: 0, to: 1, box: { x: 10, y: 10, w: 10, h: 10 } }] }) }, 1);
  submit(a, 'q1', 2);
  expect(a.responses[0].working).toBe('m=(6-2)/(3-1)\nm=4/2');
  expect(a.responses[0].strokes).toHaveLength(1);
  expect(results(a)[0].working).toBe('m=(6-2)/(3-1)\nm=4/2');
});

test('the bank: 90 original placeholder questions, unique ids, valid keys, and the exams build from it', async () => {
  const { questions } = JSON.parse(await readFile(new URL('../data/question-bank.json', import.meta.url)));
  expect(questions).toHaveLength(90);
  expect(new Set(questions.map((q) => q.id)).size).toBe(90);
  for (const subject of ['Mathematics', 'English', 'Biology']) expect(questions.filter((q) => q.subject === subject)).toHaveLength(30);
  for (const q of questions) {
    expect(q.source.kind).toBe('original-placeholder');
    expect(q.source.year).toBeNull();
    expect(q.seconds).toBeGreaterThan(0);
    if (q.type === 'choice') expect(q.options).toContain(q.answer);
    else expect(Number.isFinite(numberValue(q.answer))).toBe(true);
  }
  const gradient = buildExam(questions, 'gradient-challenge');
  expect(gradient.questions.map((q) => q.id)).toEqual(['MAT-001', 'MAT-002']);
  expect(examSummary(gradient)).toMatchObject({ count: 2, seconds: [120, 120], subjects: ['Mathematics'] });
  expect(buildExam(questions, 'three-subject').questions).toHaveLength(9);
  expect(buildExam(questions, 'gradient-challenge', { multiplier: 1.5 }).questions[0].seconds).toBe(180);
  expect(buildExam(questions, 'nope')).toBeNull();
  expect(Object.keys(EXAMS)).toContain('gradient-challenge');
});

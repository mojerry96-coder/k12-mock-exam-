// Exam definitions live on the server: the client asks for an exam by id and never chooses its
// questions, order or timing. Each subject exam draws a fresh random set from the bank, avoiding
// questions the learner has already seen until the subject runs out. A real deployment reads these
// (and each learner's eligibility and accommodations) from the host's trusted records.
import { readFile } from 'node:fs/promises';

export const SUBJECTS = ['Mathematics', 'English', 'Biology'];

export const EXAMS = {
  mathematics: { label: 'Mathematics mock', title: 'Maths challenge', subjects: ['Mathematics'] },
  english: { label: 'English mock', title: 'English challenge', subjects: ['English'] },
  biology: { label: 'Biology mock', title: 'Biology challenge', subjects: ['Biology'] },
  mixed: { label: 'Three-subject mock', title: 'Mixed challenge', subjects: SUBJECTS },
  // The two questions from the design references, always the same (not offered in the picker).
  'gradient-challenge': {
    label: 'Mathematics mock', title: 'Gradient challenge', hidden: true,
    fixed: (bank) => bank.filter((q) => q.subject === 'Mathematics' && q.topic === 'Gradient'),
  },
};
export const DEFAULT_EXAM = 'mathematics';

export async function loadBank(file) {
  const { questions } = JSON.parse(await readFile(file, 'utf8'));
  return questions;
}

function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Picks `count` questions: unseen ones first, at random; if too few are left, the ones seen longest
// ago fill in (so a learner works through the whole subject before anything repeats).
export function pickQuestions(pool, count, { seen = [], random = Math.random } = {}) {
  const order = new Map(seen.map((id, i) => [id, i])); // oldest first
  const fresh = shuffle(pool.filter((q) => !order.has(q.id)), random);
  const stale = pool.filter((q) => order.has(q.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
  return [...fresh, ...stale].slice(0, Math.min(count, pool.length));
}

// `multiplier` stands in for a learner's extra-time accommodation, set by trusted server config.
export function buildExam(bank, id, { multiplier = 1, count = 2, seen = [], random = Math.random } = {}) {
  const def = Object.hasOwn(EXAMS, id) ? EXAMS[id] : null;
  if (!def) return null;
  const chosen = def.fixed ? def.fixed(bank) : pickQuestions(bank.filter((q) => def.subjects.includes(q.subject)), count, { seen, random });
  const questions = chosen.map((q) => ({ ...q, seconds: Math.round(q.seconds * multiplier) }));
  if (!questions.length) return null;
  const meta = {
    id, label: def.label, title: def.title,
    subjects: [...new Set(questions.map((q) => q.subject))],
    topics: [...new Set(questions.map((q) => q.topic))],
  };
  return { meta, questions };
}

// What the preparation screen may show before the exam starts: size and timing, no content.
export function examSummary(bank, id, { multiplier = 1, count = 2 } = {}) {
  const def = Object.hasOwn(EXAMS, id) ? EXAMS[id] : null;
  if (!def) return null;
  const pool = def.fixed ? def.fixed(bank) : bank.filter((q) => def.subjects.includes(q.subject));
  if (!pool.length) return null;
  const n = def.fixed ? pool.length : Math.min(count, pool.length);
  const subjects = [...new Set(pool.map((q) => q.subject))];
  const secs = (qs) => qs.map((q) => Math.round(q.seconds * multiplier));
  const all = secs(pool);
  return {
    id, label: def.label, title: def.title, subjects, count: n, available: pool.length,
    minSeconds: Math.min(...all), maxSeconds: Math.max(...all),
    perSubject: subjects.map((s) => ({ subject: s, available: pool.filter((q) => q.subject === s).length, seconds: Math.max(...secs(pool.filter((q) => q.subject === s))) })),
  };
}

export const examList = (bank, options) => Object.keys(EXAMS).filter((id) => !EXAMS[id].hidden).map((id) => examSummary(bank, id, options)).filter(Boolean);

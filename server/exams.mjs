// Exam definitions live on the server: the client asks for an exam by id and never chooses its
// questions, order or timing. A real deployment reads these (and each learner's eligibility and
// accommodations) from the host's trusted records instead of this file.
import { readFile } from 'node:fs/promises';

const SUBJECTS = ['Mathematics', 'English', 'Biology'];

export const EXAMS = {
  'gradient-challenge': {
    label: 'Mathematics mock',
    title: 'Gradient challenge',
    pick: (bank) => bank.filter((q) => q.subject === 'Mathematics' && q.topic === 'Gradient'),
  },
  'three-subject': {
    label: 'Three-subject mock',
    title: 'Ready for the challenge',
    pick: (bank) => SUBJECTS.flatMap((s) => bank.filter((q) => q.subject === s).slice(0, 3)),
  },
};
export const DEFAULT_EXAM = 'gradient-challenge';

export async function loadBank(file) {
  const { questions } = JSON.parse(await readFile(file, 'utf8'));
  return questions;
}

// `multiplier` stands in for a learner's extra-time accommodation, set by trusted server config.
export function buildExam(bank, id, { multiplier = 1 } = {}) {
  const def = EXAMS[id];
  if (!def) return null;
  const questions = def.pick(bank).map((q) => ({ ...q, seconds: Math.round(q.seconds * multiplier) }));
  if (!questions.length) return null;
  const meta = {
    id, label: def.label, title: def.title,
    subjects: [...new Set(questions.map((q) => q.subject))],
    topics: [...new Set(questions.map((q) => q.topic))],
  };
  return { meta, questions };
}

// What the preparation screen may show before the exam starts: counts and timing, no content.
export function examSummary(exam) {
  const seconds = exam.questions.map((q) => q.seconds);
  return {
    ...exam.meta,
    count: exam.questions.length,
    seconds,
    perSubject: exam.meta.subjects.map((s) => ({ subject: s, count: exam.questions.filter((q) => q.subject === s).length, seconds: exam.questions.find((q) => q.subject === s).seconds })),
    usesPen: exam.questions.some((q) => q.type === 'number'),
  };
}

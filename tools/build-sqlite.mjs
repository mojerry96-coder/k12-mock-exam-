// Rebuilds data/question-bank.sqlite from data/question-bank.json (the server reads the JSON).
// Table: questions(id, subject, topic, provenance, exam_year, payload) with the full item as JSON.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, rmSync } from 'node:fs';

const json = new URL('../data/question-bank.json', import.meta.url);
const out = new URL('../data/question-bank.sqlite', import.meta.url).pathname;
const { questions } = JSON.parse(readFileSync(json, 'utf8'));
rmSync(out, { force: true });
const db = new DatabaseSync(out);
db.exec('CREATE TABLE questions(id TEXT PRIMARY KEY, subject TEXT NOT NULL, topic TEXT NOT NULL, provenance TEXT NOT NULL, exam_year INTEGER, payload TEXT NOT NULL)');
const put = db.prepare('INSERT INTO questions VALUES(?, ?, ?, ?, ?, ?)');
for (const q of questions) put.run(q.id, q.subject, q.topic, q.source.kind, q.source.year ?? null, JSON.stringify(q));
db.close();
console.log(`${out}: ${questions.length} questions`);

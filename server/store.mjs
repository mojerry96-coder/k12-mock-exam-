// Attempt storage: one SQLite file, one row per attempt. Only a hash of the bearer token is stored,
// so a copied database cannot be used to resume someone's attempt.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

// Loaded with require so Vite's dev server and Vitest (which don't know node:sqlite yet) leave it alone.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const hash = (token) => createHash('sha256').update(String(token)).digest('hex');

export function createStore(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE IF NOT EXISTS attempts(token_hash TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  const put = db.prepare('INSERT OR REPLACE INTO attempts VALUES(?, ?, ?)');
  const get = db.prepare('SELECT payload FROM attempts WHERE token_hash = ?');
  return {
    create(attempt) {
      const token = randomBytes(32).toString('hex');
      put.run(hash(token), JSON.stringify(attempt), Date.now());
      return token;
    },
    load(token) {
      if (!token) return null;
      const row = get.get(hash(token));
      return row ? JSON.parse(row.payload) : null;
    },
    save(token, attempt) { put.run(hash(token), JSON.stringify(attempt), Date.now()); },
    close() { db.close(); },
  };
}

import { DatabaseSync } from 'node:sqlite';

const SEED_USERS = [
  ['Alice Owner', 'alice@example.com'],
  ['Bob Editor', 'bob@example.com'],
  ['Carol Reviewer', 'carol@example.com'],
];

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      owner_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shares (
      doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK (role IN ('viewer','editor')),
      PRIMARY KEY (doc_id, user_id)
    );
  `);
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
    for (const [n, e] of SEED_USERS) ins.run(n, e);
  }
  return db;
}

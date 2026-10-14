import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

const SEED_USERS = [
  ['Alice Owner', 'alice@example.com'],
  ['Bob Editor', 'bob@example.com'],
  ['Carol Reviewer', 'carol@example.com'],
];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    owner_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id);
  CREATE TABLE IF NOT EXISTS shares (
    doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    PRIMARY KEY (doc_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS shares_user_idx ON shares(user_id);
`;

/**
 * One tiny interface over two drivers, both real Postgres SQL:
 *  - DATABASE_URL set  -> node-postgres pool (production: Neon)
 *  - otherwise         -> PGlite (in-memory for tests, or a local data dir for dev)
 * Both expose query(text, params) -> { rows }.
 */
export async function createDb({ url, dataDir } = {}) {
  let query, close;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    query = (text, params) => pool.query(text, params);
    close = () => pool.end();
  } else {
    if (dataDir) fs.mkdirSync(path.dirname(dataDir), { recursive: true }); // PGlite only creates the leaf dir
    const lite = dataDir ? new PGlite(dataDir) : new PGlite();
    query = (text, params) => lite.query(text, params);
    close = () => lite.close();
  }
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await query(stmt);
  for (const [name, email] of SEED_USERS) {
    await query('INSERT INTO users (name, email) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [name, email]);
  }
  const one = async (text, params) => (await query(text, params)).rows[0] ?? null;
  const all = async (text, params) => (await query(text, params)).rows;
  return { query, one, all, close };
}

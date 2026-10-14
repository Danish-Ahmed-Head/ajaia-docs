import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const SEED_USERS = [
  ['Alice Owner', 'alice@example.com'],
  ['Bob Editor', 'bob@example.com'],
  ['Carol Reviewer', 'carol@example.com'],
];

// Sent as ONE multi-statement request (one round trip on cold start). The transaction-scoped advisory lock
// stops two instances that cold-start at the same moment from racing on CREATE TABLE IF NOT EXISTS.
const SCHEMA = `
  BEGIN;
  SELECT pg_advisory_xact_lock(724001);
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
  CREATE TABLE IF NOT EXISTS document_versions (
    id SERIAL PRIMARY KEY,
    doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id),
    note TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS versions_doc_idx ON document_versions(doc_id, id DESC);
  COMMIT;
`;
const SEED_SQL = `INSERT INTO users (name, email) VALUES ${SEED_USERS.map((_, i) => `($${2 * i + 1}, $${2 * i + 2})`).join(', ')}
                  ON CONFLICT (email) DO NOTHING`;

/** query/one/all over any "run one statement" function, so pool, PGlite and transactions share one shape. */
const helpers = (query) => ({
  query,
  one: async (text, params) => (await query(text, params)).rows[0] ?? null,
  all: async (text, params) => (await query(text, params)).rows,
});

/**
 * One tiny interface over two drivers, both real Postgres SQL:
 *  - DATABASE_URL set  -> node-postgres pool (production: Neon)
 *  - otherwise         -> PGlite (in-memory for tests, or a local data dir for dev)
 * Exposes query/one/all, tx(fn) for atomic multi-statement work, close() and kind.
 */
export async function createDb({ url, dataDir } = {}) {
  let exec, query, tx, close;
  if (url) {
    // idleTimeoutMillis < Neon's 5-minute auto-suspend, so we close idle sockets before Neon kills them.
    // Timeouts: fail fast with a 500 instead of hanging until the platform kills the function (e.g. Neon waking up).
    const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
    // Without a listener, an idle client dropped by the server (Neon suspend) emits an unhandled 'error' and kills the process.
    pool.on('error', (err) => console.error('Postgres idle client error (pool will reconnect):', err.message));
    exec = (sql) => pool.query(sql); // no params = simple protocol, which allows several statements in one round trip
    query = (text, params) => pool.query(text, params);
    tx = async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(helpers((text, params) => client.query(text, params)));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    };
    close = () => pool.end();
  } else {
    // Loaded only when needed, so production (Postgres) never pays for PGlite's WASM at cold start.
    const { PGlite } = await import('@electric-sql/pglite');
    if (dataDir) fs.mkdirSync(path.dirname(dataDir), { recursive: true }); // PGlite only creates the leaf dir
    const lite = dataDir ? new PGlite(dataDir) : new PGlite();
    exec = (sql) => lite.exec(sql);
    query = (text, params) => lite.query(text, params);
    tx = (fn) => lite.transaction((t) => fn(helpers((text, params) => t.query(text, params))));
    close = () => lite.close();
  }
  try {
    await exec(SCHEMA);
    await query(SEED_SQL, SEED_USERS.flat());
  } catch (err) {
    await close().catch(() => {}); // don't leak a pool when start-up fails; the caller retries with a new one
    throw err;
  }
  return { ...helpers(query), tx, close, kind: url ? 'postgres' : 'pglite' };
}

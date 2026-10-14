import crypto from 'node:crypto';
import path from 'node:path';
import { createApp } from './app.js';
import { createDb } from './db.js';

const production = process.env.NODE_ENV === 'production';
// Fail fast: without this, a production host with a forgotten DATABASE_URL would quietly use a throwaway local database.
if (production && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (production) throw new Error('SESSION_SECRET is required in production');
  sessionSecret = crypto.randomBytes(32).toString('hex'); // dev only: sessions reset when the server restarts
}

// Production: DATABASE_URL (Neon Postgres). Local: PGlite persisted in ./data. E2E: DB_IN_MEMORY=1 for a clean DB per run.
const db = await createDb({
  url: process.env.DATABASE_URL,
  dataDir: process.env.DATABASE_URL || process.env.DB_IN_MEMORY ? undefined : path.join(process.cwd(), 'data', 'pglite'),
});
const port = Number(process.env.PORT) || 3000;
createApp(db, { sessionSecret, production }).listen(port, () =>
  console.log(`Ajaia Docs on http://localhost:${port} (${process.env.DATABASE_URL ? 'Postgres' : 'local PGlite'}, ${production ? 'production' : 'development'})`));

import path from 'node:path';
import { createApp } from './app.js';
import { createDb } from './db.js';

// Production: DATABASE_URL (Neon Postgres). Local: PGlite persisted in ./data — no setup needed.
const db = await createDb({
  url: process.env.DATABASE_URL,
  dataDir: process.env.DATABASE_URL ? undefined : path.join(process.cwd(), 'data', 'pglite'),
});
const port = Number(process.env.PORT) || 3000;
createApp(db).listen(port, () =>
  console.log(`Ajaia Docs on http://localhost:${port} (${process.env.DATABASE_URL ? 'Postgres' : 'local PGlite'})`));

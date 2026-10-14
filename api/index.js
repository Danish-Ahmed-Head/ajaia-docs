// Vercel entry point: the whole Express API runs as one Vercel Function.
// vercel.json rewrites /api/* here; Express still sees the original path, so routes match unchanged.
import { createApp } from '../server/app.js';
import { createDb } from '../server/db.js';

if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set. Add it in Vercel → Settings → Environment Variables');
if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set: using a temporary in-memory database (data will not persist)');

const db = await createDb({ url: process.env.DATABASE_URL });

export default createApp(db, { sessionSecret: process.env.SESSION_SECRET, production: true });

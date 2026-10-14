// Vercel entry point. scripts/build-vercel.mjs bundles this file and its dependencies into one
// self-contained ES module, because Vercel's function loader can't require() ESM-only packages
// (sanitize-html → htmlparser2 v12) from node_modules at runtime.
import { createApp } from './app.js';
import { createDb } from './db.js';

let appPromise = null;

// async so that configuration errors become a rejected promise the handler turns into a JSON 500.
async function init() {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set. Add it in Vercel → Settings → Environment Variables');
  if (!process.env.DATABASE_URL && process.env.VERCEL) throw new Error('DATABASE_URL is not set. Add it in Vercel → Settings → Environment Variables');
  const db = await createDb({ url: process.env.DATABASE_URL });
  return createApp(db, { sessionSecret: process.env.SESSION_SECRET, production: true });
}

/** Vercel calls this for every request; the app and its DB pool are created once per instance and reused. */
export default async function handler(req, res) {
  appPromise ??= init();
  let app;
  try {
    app = await appPromise;
  } catch (err) {
    appPromise = null; // let the next request retry (e.g. the database was waking up)
    console.error(err);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'Server is not configured correctly' }));
  }
  return app(req, res);
}

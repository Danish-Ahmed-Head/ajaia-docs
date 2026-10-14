import { createApp } from '../server/app.js';
import { createDb } from '../server/db.js';

export const SECRET = 'test-secret-'.padEnd(40, 'x');

/** Boots the real app on a random port over in-memory Postgres (PGlite). */
export async function startServer(config = {}) {
  const db = await createDb();
  const server = createApp(db, { sessionSecret: SECRET, ...config }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, db, stop: async () => { server.close(); await db.close(); } };
}

/** Logs in as `email` and returns a fetch wrapper that sends that user's session cookie. */
export async function loginAs(base, email) {
  const r = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  });
  if (!r.ok) throw new Error(`login failed for ${email}: ${r.status}`);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = (path, opts = {}) => {
    const isForm = opts.body instanceof FormData;
    return fetch(base + path, {
      method: opts.method,
      headers: { cookie, ...(opts.body && !isForm ? { 'content-type': 'application/json' } : {}) },
      body: isForm ? opts.body : opts.body && JSON.stringify(opts.body),
    });
  };
  call.cookie = cookie;
  return call;
}

export const fileForm = (content, name) => {
  const fd = new FormData();
  fd.append('file', new Blob([content]), name);
  return fd;
};

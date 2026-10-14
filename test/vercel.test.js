import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

// Runs api/index.js the way Vercel does: a default-exported (req, res) handler, no listen() of its own.
test('Vercel entry serves the API as a plain request handler', async () => {
  process.env.SESSION_SECRET = 'vercel-test-secret-'.padEnd(40, 'x');
  delete process.env.DATABASE_URL; // falls back to in-memory, which /api/health reports
  const { default: handler } = await import('../api/index.js');
  const server = http.createServer(handler).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, db: 'pglite' });
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"alice@example.com"}' });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /; Secure$/); // production mode: Secure cookies
    const docs = await fetch(`${base}/api/docs`, { headers: { cookie: login.headers.get('set-cookie').split(';')[0] } });
    assert.equal(docs.status, 200);
  } finally {
    server.close();
  }
});

test('Vercel entry refuses to start without SESSION_SECRET', () => {
  const env = { ...process.env };
  delete env.SESSION_SECRET;
  assert.throws(
    () => execFileSync(process.execPath, ['--input-type=module', '-e', "await import('./api/index.js')"], { env, stdio: 'pipe' }),
    (e) => /SESSION_SECRET is not set/.test(e.stderr.toString()),
  );
});

test('vercel.json routes /api to the function, serves the Vite build, and sets security headers', async () => {
  const { default: fs } = await import('node:fs');
  const cfg = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url)));
  assert.equal(cfg.outputDirectory, 'dist');
  assert.deepEqual(cfg.rewrites, [{ source: '/api/(.*)', destination: '/api' }]);
  const headers = Object.fromEntries(cfg.headers[0].headers.map((h) => [h.key, h.value]));
  assert.match(headers['Content-Security-Policy'], /script-src 'self'/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});

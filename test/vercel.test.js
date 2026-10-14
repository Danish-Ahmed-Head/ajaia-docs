import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SECRET = 'vercel-test-secret-'.padEnd(40, 'x');
const BUNDLE = path.resolve('.vercel/output/functions/api.func/index.mjs');

// Build exactly what Vercel deploys: the Vite build plus the bundled function.
before(() => {
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'error'], { stdio: 'pipe' });
  execFileSync(process.execPath, ['scripts/build-vercel.mjs'], { stdio: 'pipe' });
});

async function serve(handler, fn) {
  const server = http.createServer(handler).listen(0);
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('bundled function serves the API (Vercel-style handler, Secure cookies)', async () => {
  process.env.SESSION_SECRET = SECRET;
  delete process.env.DATABASE_URL; // local fallback; on Vercel DATABASE_URL is required
  delete process.env.VERCEL;
  const { default: handler } = await import(pathToFileURL(BUNDLE).href);
  await serve(handler, async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, db: 'pglite' });
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"alice@example.com"}' });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /; Secure$/);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const created = await fetch(`${base}/api/docs`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"title":"t"}' });
    const { id } = await created.json();
    // sanitize-html (the package that crashed on Vercel) runs inside the bundle:
    await fetch(`${base}/api/docs/${id}`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ content: '<p>ok<script>x</script></p>' }) });
    assert.equal((await (await fetch(`${base}/api/docs/${id}`, { headers: { cookie } })).json()).content, '<p>ok</p>');
  });
});

test('bundle is self-contained: it loads with no node_modules at all (the Vercel failure mode)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-fn-'));
  fs.copyFileSync(BUNDLE, path.join(dir, 'index.mjs'));
  const script = `
    const { default: handler } = await import(${JSON.stringify(pathToFileURL(path.join(dir, 'index.mjs')).href)});
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { console.log(this.statusCode, b); } };
    await handler({}, res);`;
  // Valid secret + unreachable database: the module must load (no ERR_REQUIRE_ESM) and fail cleanly with JSON.
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: dir, stdio: 'pipe',
    env: { PATH: process.env.PATH, SESSION_SECRET: SECRET, DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db', VERCEL: '1' },
  }).toString();
  assert.match(out, /^500 \{"error":"Server is not configured correctly"\}/m);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('missing secrets fail with a clear JSON 500, not a crash', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-fn-'));
  fs.copyFileSync(BUNDLE, path.join(dir, 'index.mjs'));
  const script = `
    const { default: handler } = await import('./index.mjs');
    const res = { statusCode: 0, setHeader() {}, end(b) { console.log(this.statusCode, b); } };
    await handler({}, res);`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: dir, stdio: 'pipe', env: { PATH: process.env.PATH, VERCEL: '1' } });
  assert.match(out.toString(), /^500 /m);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Vercel output: static site, one function, /api routed to it, security headers on every response', () => {
  const out = path.resolve('.vercel/output');
  assert.ok(fs.existsSync(path.join(out, 'static/index.html')));
  const vc = JSON.parse(fs.readFileSync(path.join(out, 'functions/api.func/.vc-config.json')));
  assert.equal(vc.handler, 'index.mjs');
  const cfg = JSON.parse(fs.readFileSync(path.join(out, 'config.json')));
  assert.equal(cfg.version, 3);
  const headerRoute = cfg.routes.find((r) => r.headers);
  assert.match(headerRoute.headers['Content-Security-Policy'], /script-src 'self'/);
  assert.ok(cfg.routes.some((r) => r.dest === '/api' && new RegExp(`^${r.src}$`).test('/api/docs/1')));
  assert.ok(!cfg.routes.some((r) => r.dest === '/api' && new RegExp(`^${r.src}$`).test('/apiary'))); // only /api and /api/*
});

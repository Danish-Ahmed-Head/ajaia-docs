import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, loginAs, SECRET } from './helpers.js';
import { sessions } from '../server/session.js';

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.stop());
const asCookie = (cookie) => fetch(`${srv.base}/api/me`, { headers: { cookie } }).then((r) => r.json());

test('session cookie is signed: tampered, forged or unsigned cookies are rejected', async () => {
  const alice = await loginAs(srv.base, 'alice@example.com');
  assert.equal((await asCookie(alice.cookie)).email, 'alice@example.com');

  const [, sig] = alice.cookie.split('=')[1].split('.');
  assert.equal(await asCookie(`sid=2.${sig}`), null); // swap the user id, keep Alice's signature
  assert.equal(await asCookie('sid=2'), null); // no signature
  const forged = crypto.createHmac('sha256', 'wrong-secret').update('2').digest('base64url');
  assert.equal(await asCookie(`sid=2.${forged}`), null); // signed with the wrong key
  assert.equal(await asCookie('sid=abc.def'), null);
});

test('session cookie attributes: HttpOnly, SameSite=Lax, Secure only in production', async () => {
  const set = (production) => {
    const headers = [];
    sessions(SECRET, { secure: production }).set({ append: (_k, v) => headers.push(v) }, 1);
    return headers[0];
  };
  assert.match(set(false), /HttpOnly; SameSite=Lax$/);
  assert.match(set(true), /HttpOnly; SameSite=Lax; Secure$/);
  assert.throws(() => sessions('short', { secure: false }), /at least 32/);
});

test('security headers are set (CSP, nosniff, frame protection, no x-powered-by)', async () => {
  const r = await fetch(`${srv.base}/api/health`);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('API rejects non-JSON bodies (blocks form-encoded cross-site posts)', async () => {
  const alice = await loginAs(srv.base, 'alice@example.com');
  for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
    const r = await fetch(`${srv.base}/api/docs`, { method: 'POST', headers: { cookie: alice.cookie, 'content-type': type }, body: 'title=x' });
    assert.equal(r.status, 415, type);
  }
  // Bodiless POSTs (logout) and DELETEs are not affected.
  const logout = await fetch(`${srv.base}/api/logout`, { method: 'POST', headers: { cookie: alice.cookie } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /^sid=; Max-Age=0/);
});

test('failed logins are rate limited (429 after 20); successful logins are not counted', async () => {
  const attempt = (email) => fetch(`${srv.base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  });
  for (let i = 0; i < 25; i++) assert.equal((await attempt('alice@example.com')).status, 200);
  for (let i = 0; i < 20; i++) assert.equal((await attempt('eve@example.com')).status, 404);
  const blocked = await attempt('eve@example.com');
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { error: 'Too many requests, please slow down' });
});

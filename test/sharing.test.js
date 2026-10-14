import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, loginAs } from './helpers.js';

let srv, alice, bob, carol, id;
before(async () => {
  srv = await startServer();
  [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map((u) => loginAs(srv.base, `${u}@example.com`)));
  ({ id } = await (await alice('/api/docs', { method: 'POST', body: { title: 'Edge cases' } })).json());
});
after(() => srv.stop());
const share = (who, email, role) => who(`/api/docs/${id}/share`, { method: 'POST', body: { email, role } });

test('owner sees the share list; editors and viewers do not', async () => {
  await share(alice, 'bob@example.com', 'editor');
  const owner = await (await alice(`/api/docs/${id}`)).json();
  assert.deepEqual(owner.shares.map((s) => [s.email, s.role]), [['bob@example.com', 'editor']]);
  assert.deepEqual((await (await bob(`/api/docs/${id}`)).json()).shares, []);
});

test('re-sharing changes the role instead of duplicating', async () => {
  await share(alice, 'bob@example.com', 'viewer');
  const owner = await (await alice(`/api/docs/${id}`)).json();
  assert.equal(owner.shares.length, 1);
  assert.equal(owner.shares[0].role, 'viewer');
  assert.equal((await bob(`/api/docs/${id}`, { method: 'PUT', body: { title: 'x' } })).status, 403); // downgrade applies immediately
});

test('invalid share requests are rejected', async () => {
  assert.equal((await share(alice, 'alice@example.com', 'editor')).status, 400); // owner already has access
  assert.equal((await share(alice, 'nobody@example.com', 'editor')).status, 404);
  assert.equal((await share(alice, 'carol@example.com', 'admin')).status, 400);
  assert.equal((await share(alice, '', 'editor')).status, 404);
  assert.equal((await share(carol, 'carol@example.com', 'editor')).status, 403); // non-member can't share
});

test('unsharing revokes access immediately; only the owner can unshare', async () => {
  const bobId = (await (await alice(`/api/docs/${id}`)).json()).shares[0].id;
  assert.equal((await bob(`/api/docs/${id}/share/${bobId}`, { method: 'DELETE' })).status, 403);
  assert.equal((await alice(`/api/docs/${id}/share/${bobId}`, { method: 'DELETE' })).status, 200);
  assert.equal((await bob(`/api/docs/${id}`)).status, 403);
  assert.ok(!(await (await bob('/api/docs')).json()).shared.some((d) => d.id === id));
});

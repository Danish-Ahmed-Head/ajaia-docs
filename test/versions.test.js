import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, loginAs, fileForm } from './helpers.js';

let srv, alice, bob, carol, id;
before(async () => {
  srv = await startServer();
  [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map((u) => loginAs(srv.base, `${u}@example.com`)));
  ({ id } = await (await alice('/api/docs', { method: 'POST', body: { title: 'History' } })).json());
  await alice(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'bob@example.com', role: 'editor' } });
  await alice(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'carol@example.com', role: 'viewer' } });
});
after(() => srv.stop());
const save = (who, content) => who(`/api/docs/${id}`, { method: 'PUT', body: { content } });
const versions = async (who) => (await who(`/api/docs/${id}/versions`)).json();

test('autosaves by one person fold into one version; another author starts a new one', async () => {
  await save(alice, '<p>v1</p>');
  await save(alice, '<p>v1 more</p>');
  await save(alice, '<p>v1 final</p>');
  let list = await versions(alice);
  assert.equal(list.length, 1);
  assert.equal(list[0].author_name, 'Alice Owner');

  await save(bob, '<p>bob edit</p>');
  list = await versions(alice);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((v) => v.author_name), ['Bob Editor', 'Alice Owner']); // newest first

  const older = await (await alice(`/api/docs/${id}/versions/${list[1].id}`)).json();
  assert.equal(older.content, '<p>v1 final</p>'); // the folded version holds the last save of that session
});

test('restore brings back an old version and is itself recorded', async () => {
  const list = await versions(bob);
  const aliceVersion = list.find((v) => v.author_name === 'Alice Owner');
  const r = await bob(`/api/docs/${id}/versions/${aliceVersion.id}/restore`, { method: 'POST' });
  assert.equal(r.status, 200);
  assert.equal((await (await bob(`/api/docs/${id}`)).json()).content, '<p>v1 final</p>');

  const after = await versions(bob);
  assert.match(after[0].note, /^Restored the version from /);
  // An edit right after a restore starts a new version instead of overwriting the restore point.
  await save(bob, '<p>after restore</p>');
  assert.equal((await versions(bob)).length, after.length + 1);
});

test('viewers can see history but not restore; strangers see nothing', async () => {
  const list = await versions(carol);
  assert.ok(list.length >= 1);
  assert.equal((await carol(`/api/docs/${id}/versions/${list[0].id}/restore`, { method: 'POST' })).status, 403);

  const { id: other } = await (await bob('/api/docs', { method: 'POST', body: { title: 'Bob private' } })).json();
  await bob(`/api/docs/${other}`, { method: 'PUT', body: { content: '<p>secret</p>' } });
  const secretVersion = (await (await bob(`/api/docs/${other}/versions`)).json())[0];
  assert.equal((await alice(`/api/docs/${other}/versions`)).status, 403);
  // A version id from another document can't be read or restored through a document you do have access to.
  assert.equal((await alice(`/api/docs/${id}/versions/${secretVersion.id}`)).status, 404);
  assert.equal((await alice(`/api/docs/${id}/versions/${secretVersion.id}/restore`, { method: 'POST' })).status, 404);
  assert.equal((await alice(`/api/docs/${id}/versions/999999`)).status, 404);
});

test('importing a file records the first version with a note', async () => {
  const r = await alice('/api/upload', { method: 'POST', body: fileForm('# Notes', 'notes.md') });
  const { id: imported } = await r.json();
  const list = await (await alice(`/api/docs/${imported}/versions`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].note, 'Imported from notes.md');
});

test('presence: members see each other; it reports the last editor; strangers are refused', async () => {
  const ping = (who) => who(`/api/docs/${id}/presence`, { method: 'POST' }).then((r) => r.json());
  assert.deepEqual((await ping(alice)).others, []);
  const seenByBob = await ping(bob);
  assert.deepEqual(seenByBob.others.map((o) => o.name), ['Alice Owner']);
  assert.ok(seenByBob.updated_at);
  assert.equal(seenByBob.last_editor, 'Bob Editor');
  assert.deepEqual((await ping(carol)).others.map((o) => o.name).sort(), ['Alice Owner', 'Bob Editor']);

  await alice(`/api/docs/${id}/presence`, { method: 'DELETE' });
  assert.deepEqual((await ping(carol)).others.map((o) => o.name), ['Bob Editor']);

  const { id: other } = await (await bob('/api/docs', { method: 'POST', body: { title: 'Private' } })).json();
  assert.equal((await alice(`/api/docs/${other}/presence`, { method: 'POST' })).status, 403);
});

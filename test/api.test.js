import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, loginAs, fileForm } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(() => srv.stop());
const login = (email) => loginAs(srv.base, email);

test('documents: create, rename, edit, reopen; formatting kept, scripts stripped', async () => {
  const alice = await login('alice@example.com');
  const created = await alice('/api/docs', { method: 'POST', body: { title: '  Plan  ' } });
  assert.equal(created.status, 201);
  const { id } = await created.json();

  const save = await alice(`/api/docs/${id}`, {
    method: 'PUT',
    body: { title: 'Plan v1', content: '<h1>Hi</h1><p><strong>x</strong><u>y</u><script>alert(1)</script><img src=x onerror=alert(1)></p><ul><li><p>a</p></li></ul>' },
  });
  assert.equal(save.status, 200);
  const doc = await (await alice(`/api/docs/${id}`)).json();
  assert.equal(doc.title, 'Plan v1');
  assert.equal(doc.role, 'owner');
  assert.equal(doc.content, '<h1>Hi</h1><p><strong>x</strong><u>y</u></p><ul><li><p>a</p></li></ul>');

  const list = await (await alice('/api/docs')).json();
  assert.ok(list.owned.some((d) => d.id === id && d.title === 'Plan v1'));
});

test('documents: validation errors', async () => {
  const alice = await login('alice@example.com');
  const { id } = await (await alice('/api/docs', { method: 'POST', body: {} })).json();
  assert.equal((await (await alice(`/api/docs/${id}`)).json()).title, 'Untitled document');
  const put = (body) => alice(`/api/docs/${id}`, { method: 'PUT', body });
  assert.equal((await put({ title: '   ' })).status, 400);
  assert.equal((await put({ title: 'x'.repeat(201) })).status, 400);
  assert.equal((await put({ content: 42 })).status, 400);
  assert.equal((await put({})).status, 400);
  assert.equal((await put({ content: 'x'.repeat(1_000_001) })).status, 413);
});

test('sharing: owned vs shared lists and role enforcement', async () => {
  const alice = await login('alice@example.com');
  const bob = await login('bob@example.com');
  const carol = await login('carol@example.com');
  const { id } = await (await alice('/api/docs', { method: 'POST', body: { title: 'Shared plan' } })).json();

  assert.equal((await bob(`/api/docs/${id}`)).status, 403); // not shared yet
  await alice(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'bob@example.com', role: 'editor' } });
  await alice(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'CAROL@example.com ', role: 'viewer' } });

  const bobList = await (await bob('/api/docs')).json();
  assert.ok(!bobList.owned.some((d) => d.id === id));
  const sharedWithBob = bobList.shared.find((d) => d.id === id);
  assert.equal(sharedWithBob.role, 'editor');
  assert.equal(sharedWithBob.owner_name, 'Alice Owner');

  assert.equal((await bob(`/api/docs/${id}`, { method: 'PUT', body: { content: '<p>bob was here</p>' } })).status, 200);
  assert.equal((await carol(`/api/docs/${id}`)).status, 200);
  assert.equal((await carol(`/api/docs/${id}`, { method: 'PUT', body: { title: 'Nope' } })).status, 403);
  assert.equal((await bob(`/api/docs/${id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await bob(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'carol@example.com', role: 'editor' } })).status, 403);
  assert.equal((await (await alice(`/api/docs/${id}`)).json()).content, '<p>bob was here</p>');
});

test('upload: .txt and .md become editable docs; unsupported type and empty request rejected', async () => {
  const alice = await login('alice@example.com');
  const r = await alice('/api/upload', { method: 'POST', body: fileForm('Hello\n\nWorld <b>', 'notes.txt') });
  assert.equal(r.status, 201);
  const doc = await (await alice(`/api/docs/${(await r.json()).id}`)).json();
  assert.equal(doc.title, 'notes');
  assert.equal(doc.content, '<p>Hello</p>\n<p>World &lt;b&gt;</p>');

  const md = await alice('/api/upload', { method: 'POST', body: fileForm('# Title\n\n- **one**\n- two', 'spec.md') });
  const mdDoc = await (await alice(`/api/docs/${(await md.json()).id}`)).json();
  assert.equal(mdDoc.content, '<h1>Title</h1>\n<ul>\n<li><strong>one</strong></li>\n<li>two</li>\n</ul>');

  const bad = await alice('/api/upload', { method: 'POST', body: fileForm('x', 'evil.exe') });
  assert.equal(bad.status, 415);
  assert.match((await bad.json()).error, /Supported: \.txt, \.md, \.docx/);

  assert.equal((await alice('/api/upload', { method: 'POST', body: new FormData() })).status, 400);
  const big = await alice('/api/upload', { method: 'POST', body: fileForm('x'.repeat(2 * 1024 * 1024 + 1), 'big.txt') });
  assert.equal(big.status, 413);
});

test('upload keeps non-ASCII filenames intact', async () => {
  const alice = await login('alice@example.com');
  const { id } = await (await alice('/api/upload', { method: 'POST', body: fileForm('x', 'Résumé notes.txt') })).json();
  assert.equal((await (await alice(`/api/docs/${id}`)).json()).title, 'Résumé notes');
});

test('unauthenticated, malformed and unknown requests get clean JSON errors', async () => {
  assert.equal((await fetch(`${srv.base}/api/docs`)).status, 401);
  const alice = await login('alice@example.com');
  assert.equal((await alice('/api/docs/999999')).status, 404);
  assert.equal((await alice('/api/docs/abc')).status, 404);
  assert.equal((await alice('/api/docs/1e3')).status, 404);
  assert.equal((await alice('/api/nope')).status, 404);
  const bad = await fetch(`${srv.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'Malformed JSON' });
  const unknown = await fetch(`${srv.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"eve@example.com"}' });
  assert.equal(unknown.status, 404);
});

test('deleting a document removes it for everyone it was shared with', async () => {
  const alice = await login('alice@example.com');
  const bob = await login('bob@example.com');
  const { id } = await (await alice('/api/docs', { method: 'POST', body: { title: 'Temp' } })).json();
  await alice(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'bob@example.com', role: 'viewer' } });
  assert.equal((await bob(`/api/docs/${id}`)).status, 200);
  assert.equal((await alice(`/api/docs/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await bob(`/api/docs/${id}`)).status, 404);
  assert.ok(!(await (await bob('/api/docs')).json()).shared.some((d) => d.id === id));
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { createDb } from '../server/db.js';

// Real Postgres SQL via in-memory PGlite: same dialect as production (Neon), zero setup.
let server, base, db;
before(async () => {
  db = await createDb();
  server = createApp(db).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

async function login(email) {
  const r = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return (path, opts = {}) => {
    const isForm = opts.body instanceof FormData;
    return fetch(base + path, {
      method: opts.method,
      headers: { cookie, ...(opts.body && !isForm ? { 'content-type': 'application/json' } : {}) },
      body: isForm ? opts.body : opts.body && JSON.stringify(opts.body),
    });
  };
}

test('sharing: owned vs shared, role enforcement, sanitisation', async () => {
  const alice = await login('alice@example.com');
  const bob = await login('bob@example.com');
  const carol = await login('carol@example.com');

  const { id } = await (await alice('/api/docs', { method: 'POST', body: { title: 'Plan' } })).json();
  const save = await alice(`/api/docs/${id}`, {
    method: 'PUT', body: { content: '<h1>Hi</h1><p><strong>x</strong><u>y</u><script>alert(1)</script></p>' },
  });
  assert.equal(save.status, 200);
  const doc = await (await alice(`/api/docs/${id}`)).json();
  assert.equal(doc.role, 'owner');
  assert.equal(doc.content, '<h1>Hi</h1><p><strong>x</strong><u>y</u></p>'); // script stripped, formatting kept

  assert.equal((await bob(`/api/docs/${id}`)).status, 403); // not shared yet

  await alice(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'bob@example.com', role: 'editor' } });
  await alice(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'carol@example.com', role: 'viewer' } });

  const bobList = await (await bob('/api/docs')).json();
  assert.equal(bobList.owned.length, 0);
  assert.equal(bobList.shared[0].title, 'Plan');
  assert.equal(bobList.shared[0].role, 'editor');

  assert.equal((await bob(`/api/docs/${id}`, { method: 'PUT', body: { title: 'Plan v2' } })).status, 200);
  assert.equal((await carol(`/api/docs/${id}`)).status, 200); // viewer can read
  assert.equal((await carol(`/api/docs/${id}`, { method: 'PUT', body: { title: 'Nope' } })).status, 403);
  assert.equal((await bob(`/api/docs/${id}`, { method: 'DELETE' })).status, 403); // only owner deletes
  assert.equal((await bob(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'carol@example.com', role: 'editor' } })).status, 403);
  assert.equal((await alice(`/api/docs/${id}`, { method: 'PUT', body: { title: '   ' } })).status, 400);
  assert.equal((await alice(`/api/docs/${id}`)).status, 200);
  assert.equal((await (await alice(`/api/docs/${id}`)).json()).title, 'Plan v2');
});

test('upload: .txt and .md become editable docs; unsupported type rejected', async () => {
  const alice = await login('alice@example.com');
  const fd = new FormData();
  fd.append('file', new Blob(['Hello\n\nWorld <b>']), 'notes.txt');
  const r = await alice('/api/upload', { method: 'POST', body: fd });
  assert.equal(r.status, 201);
  const doc = await (await alice(`/api/docs/${(await r.json()).id}`)).json();
  assert.equal(doc.title, 'notes');
  assert.match(doc.content, /<p>Hello<\/p>/);
  assert.match(doc.content, /World &lt;b&gt;/); // user text escaped, not interpreted

  const md = new FormData();
  md.append('file', new Blob(['# Title\n\n- **one**\n- two']), 'spec.md');
  const mdDoc = await (await alice(`/api/docs/${(await (await alice('/api/upload', { method: 'POST', body: md })).json()).id}`)).json();
  assert.equal(mdDoc.content, '<h1>Title</h1>\n<ul>\n<li><strong>one</strong></li>\n<li>two</li>\n</ul>');

  const bad = new FormData();
  bad.append('file', new Blob(['x']), 'evil.exe');
  const badRes = await alice('/api/upload', { method: 'POST', body: bad });
  assert.equal(badRes.status, 415);
  assert.match((await badRes.json()).error, /Supported: \.txt, \.md, \.docx/);
});

test('upload keeps non-ASCII filenames intact', async () => {
  const alice = await login('alice@example.com');
  const fd = new FormData();
  fd.append('file', new Blob(['x']), 'Résumé notes.txt');
  const { id } = await (await alice('/api/upload', { method: 'POST', body: fd })).json();
  assert.equal((await (await alice(`/api/docs/${id}`)).json()).title, 'Résumé notes');
});

test('unauthenticated, malformed and unknown requests get clean errors', async () => {
  assert.equal((await fetch(`${base}/api/docs`)).status, 401);
  const alice = await login('alice@example.com');
  assert.equal((await alice('/api/docs/999999')).status, 404);
  assert.equal((await alice('/api/docs/abc')).status, 404);
  const bad = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'Malformed JSON' });
});

test('deleting a document removes it for people it was shared with', async () => {
  const alice = await login('alice@example.com');
  const bob = await login('bob@example.com');
  const { id } = await (await alice('/api/docs', { method: 'POST', body: { title: 'Temp' } })).json();
  await alice(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'bob@example.com', role: 'viewer' } });
  assert.equal((await bob(`/api/docs/${id}`)).status, 200);
  assert.equal((await alice(`/api/docs/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await bob(`/api/docs/${id}`)).status, 404);
  assert.ok(!(await (await bob('/api/docs')).json()).shared.some((d) => d.id === id));
});

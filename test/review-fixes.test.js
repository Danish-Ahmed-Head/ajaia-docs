// Regression tests for the defects found in the independent code review (docs/SDLC.md, D9–D17).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Document, Packer, Paragraph } from 'docx';
import { startServer, loginAs, fileForm } from './helpers.js';
import { createDb } from '../server/db.js';
import { zipExpandedSize } from '../server/convert.js';

let srv, alice, bob;
before(async () => {
  srv = await startServer();
  alice = await loginAs(srv.base, 'alice@example.com');
  bob = await loginAs(srv.base, 'bob@example.com');
});
after(() => srv.stop());

test('ids outside Postgres int range, or not numbers, give 404 instead of a 500', async () => {
  const { id } = await (await alice('/api/docs', { method: 'POST', body: { title: 'ids' } })).json();
  for (const path of ['/api/docs/2147483648', '/api/docs/99999999999', `/api/docs/${id}/versions/2147483648`,
    `/api/docs/${id}/versions/0`, '/api/docs/-1']) {
    assert.equal((await alice(path)).status, 404, path);
  }
  assert.equal((await alice(`/api/docs/${id}/share/abc`, { method: 'DELETE' })).status, 404);
  assert.equal((await alice(`/api/docs/${id}/share/2147483648`, { method: 'DELETE' })).status, 404);
});

test('links always get rel="noopener noreferrer nofollow" (no reverse tabnabbing)', async () => {
  const { id } = await (await alice('/api/docs', { method: 'POST', body: { title: 'links' } })).json();
  await alice(`/api/docs/${id}`, { method: 'PUT', body: { content: '<p><a href="https://example.com" target="_blank" rel="opener">x</a></p>' } });
  const { content } = await (await alice(`/api/docs/${id}`)).json();
  assert.match(content, /rel="noopener noreferrer nofollow"/);
  assert.doesNotMatch(content, /rel="opener"/);
});

test('a malformed multipart upload is a 400, not a 500', async () => {
  const r = await fetch(`${srv.base}/api/upload`, {
    method: 'POST',
    headers: { cookie: alice.cookie, 'content-type': 'multipart/form-data; boundary=XyZ' },
    body: '--XyZ\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\nunterminated',
  });
  assert.equal(r.status, 400);
});

test('a .docx that expands beyond 20 MB is refused before mammoth unpacks it (zip bomb)', async () => {
  const doc = new Document({ sections: [{ children: [new Paragraph('a'.repeat(21 * 1024 * 1024))] }] });
  const buf = await Packer.toBuffer(doc);
  assert.ok(buf.length < 2 * 1024 * 1024, `compressed size ${buf.length} must fit the upload limit`);
  assert.ok(zipExpandedSize(buf) > 20 * 1024 * 1024);
  const r = await alice('/api/upload', { method: 'POST', body: fileForm(buf, 'bomb.docx') });
  assert.equal(r.status, 413);
  assert.match((await r.json()).error, /expands to more than 20 MB/);
  assert.equal(zipExpandedSize(Buffer.from('not a zip')), null);
});

test('version history is capped per document when authors take turns', async () => {
  const { id } = await (await alice('/api/docs', { method: 'POST', body: { title: 'turns' } })).json();
  await alice(`/api/docs/${id}/share`, { method: 'POST', body: { email: 'bob@example.com', role: 'editor' } });
  for (let i = 0; i < 106; i++) {
    const who = i % 2 ? bob : alice; // alternating authors = a new version on every save
    assert.equal((await who(`/api/docs/${id}`, { method: 'PUT', body: { content: `<p>${i}</p>` } })).status, 200);
  }
  const list = await (await alice(`/api/docs/${id}/versions`)).json();
  assert.equal(list.length, 50); // the API shows the latest 50
  const total = await srv.db.one('SELECT count(*)::int AS n FROM document_versions WHERE doc_id = $1', [id]);
  assert.equal(total.n, 100); // stored history is capped at 100
});

test('production refuses to start without DATABASE_URL (no silent throwaway database)', () => {
  const env = { PATH: process.env.PATH, NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) };
  assert.throws(() => execFileSync(process.execPath, ['server/index.js'], { env, stdio: 'pipe', timeout: 20_000 }),
    (e) => /DATABASE_URL is required in production/.test(e.stderr.toString()));
});

test('start-up against an unreachable database fails cleanly (no hang, pool closed)', async () => {
  await assert.rejects(createDb({ url: 'postgres://u:p@127.0.0.1:1/db' }));
});

test('schema setup is idempotent: restarting on the same database keeps data and seeds once', async () => {
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const { default: fs } = await import('node:fs');
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ajaia-db-')), 'pglite');
  const first = await createDb({ dataDir: dir });
  await first.query("INSERT INTO documents (title, owner_id) VALUES ('kept', 1)");
  await first.close();
  const second = await createDb({ dataDir: dir }); // schema + seed run again on existing tables
  assert.equal((await second.one('SELECT count(*)::int AS n FROM users')).n, 3);
  assert.equal((await second.one("SELECT title FROM documents WHERE title = 'kept'")).title, 'kept');
  await second.close();
});

import express from 'express';
import multer from 'multer';
import sanitizeHtml from 'sanitize-html';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { fileToHtml } from './convert.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_TITLE = 200;
const MAX_CONTENT = 1_000_000;

// Server is the source of truth for what HTML is allowed: only the formatting the editor produces.
const SANITIZE = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a', 'div'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};
const clean = (html) => sanitizeHtml(html, SANITIZE);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createApp(dbPath = ':memory:') {
  const db = openDb(dbPath);
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
  app.use(express.json({ limit: '2mb' }));

  // --- mocked auth: pick a seeded user; id stored in an httpOnly cookie (documented trade-off) ---
  const readCookie = (req, name) => {
    const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
  };
  app.use('/api', (req, _res, next) => {
    const id = Number(readCookie(req, 'uid'));
    req.user = id ? db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id) ?? null : null;
    next();
  });
  const requireUser = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Not signed in')));

  app.get('/api/users', (_req, res) => {
    res.json(db.prepare('SELECT id, name, email FROM users ORDER BY id').all());
  });
  app.post('/api/login', (req, res, next) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
    if (!user) return next(new HttpError(404, 'Unknown user'));
    res.setHeader('Set-Cookie', `uid=${user.id}; Path=/; HttpOnly; SameSite=Lax`);
    res.json(user);
  });
  app.post('/api/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'uid=; Path=/; Max-Age=0');
    res.json({ ok: true });
  });
  app.get('/api/me', (req, res) => res.json(req.user));

  // Returns the doc plus the caller's effective role ('owner' | 'editor' | 'viewer'), or throws 404/403.
  function loadDoc(id, user) {
    const doc = db.prepare(`
      SELECT d.*, u.name AS owner_name, u.email AS owner_email
      FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?`).get(Number(id));
    if (!doc) throw new HttpError(404, 'Document not found');
    let role = null;
    if (doc.owner_id === user.id) role = 'owner';
    else role = db.prepare('SELECT role FROM shares WHERE doc_id = ? AND user_id = ?').get(doc.id, user.id)?.role ?? null;
    if (!role) throw new HttpError(403, 'You do not have access to this document');
    return { doc, role };
  }
  const route = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

  app.get('/api/docs', requireUser, (req, res) => {
    const owned = db.prepare(`
      SELECT id, title, updated_at FROM documents WHERE owner_id = ? ORDER BY updated_at DESC, id DESC`).all(req.user.id);
    const shared = db.prepare(`
      SELECT d.id, d.title, d.updated_at, s.role, u.name AS owner_name
      FROM shares s JOIN documents d ON d.id = s.doc_id JOIN users u ON u.id = d.owner_id
      WHERE s.user_id = ? ORDER BY d.updated_at DESC, d.id DESC`).all(req.user.id);
    res.json({ owned, shared });
  });

  const createDoc = (user, title, content) =>
    Number(db.prepare('INSERT INTO documents (title, content, owner_id) VALUES (?, ?, ?)')
      .run(title, content, user.id).lastInsertRowid);

  app.post('/api/docs', requireUser, (req, res) => {
    const title = String(req.body?.title ?? '').trim().slice(0, MAX_TITLE) || 'Untitled document';
    res.status(201).json({ id: createDoc(req.user, title, '') });
  });

  app.get('/api/docs/:id', requireUser, route((req, res) => {
    const { doc, role } = loadDoc(req.params.id, req.user);
    const shares = role === 'owner'
      ? db.prepare(`SELECT u.id, u.name, u.email, s.role FROM shares s JOIN users u ON u.id = s.user_id
                    WHERE s.doc_id = ? ORDER BY u.name`).all(doc.id)
      : [];
    res.json({ id: doc.id, title: doc.title, content: doc.content, updated_at: doc.updated_at,
      owner: { name: doc.owner_name, email: doc.owner_email }, role, shares });
  }));

  app.put('/api/docs/:id', requireUser, route((req, res) => {
    const { doc, role } = loadDoc(req.params.id, req.user);
    if (role === 'viewer') throw new HttpError(403, 'View-only access: you cannot edit this document');
    const { title, content } = req.body ?? {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, 'Title cannot be empty');
      if (title.length > MAX_TITLE) throw new HttpError(400, `Title must be at most ${MAX_TITLE} characters`);
    }
    if (content !== undefined) {
      if (typeof content !== 'string') throw new HttpError(400, 'Content must be an HTML string');
      if (content.length > MAX_CONTENT) throw new HttpError(413, 'Document too large');
    }
    db.prepare('UPDATE documents SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(title !== undefined ? title.trim() : doc.title,
        content !== undefined ? clean(content) : doc.content, doc.id);
    res.json({ ok: true, updated_at: db.prepare('SELECT updated_at FROM documents WHERE id = ?').get(doc.id).updated_at });
  }));

  app.delete('/api/docs/:id', requireUser, route((req, res) => {
    const { doc, role } = loadDoc(req.params.id, req.user);
    if (role !== 'owner') throw new HttpError(403, 'Only the owner can delete a document');
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    res.json({ ok: true });
  }));

  // --- sharing (owner only) ---
  app.post('/api/docs/:id/share', requireUser, route((req, res) => {
    const { doc, role } = loadDoc(req.params.id, req.user);
    if (role !== 'owner') throw new HttpError(403, 'Only the owner can share this document');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const shareRole = ['viewer', 'editor'].includes(req.body?.role) ? req.body.role : null;
    if (!shareRole) throw new HttpError(400, 'role must be "viewer" or "editor"');
    const target = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!target) throw new HttpError(404, `No user with email ${email || '(empty)'}`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'The owner already has full access');
    db.prepare(`INSERT INTO shares (doc_id, user_id, role) VALUES (?, ?, ?)
                ON CONFLICT(doc_id, user_id) DO UPDATE SET role = excluded.role`).run(doc.id, target.id, shareRole);
    res.json({ ok: true });
  }));

  app.delete('/api/docs/:id/share/:userId', requireUser, route((req, res) => {
    const { doc, role } = loadDoc(req.params.id, req.user);
    if (role !== 'owner') throw new HttpError(403, 'Only the owner can change sharing');
    db.prepare('DELETE FROM shares WHERE doc_id = ? AND user_id = ?').run(doc.id, Number(req.params.userId));
    res.json({ ok: true });
  }));

  // --- file upload -> new editable document (.txt, .md, .docx) ---
  app.post('/api/upload', requireUser, upload.single('file'), route(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file provided (form field name: "file")');
    const html = clean(await fileToHtml(req.file.originalname, req.file.buffer));
    const title = req.file.originalname.replace(/\.[^.]+$/, '').slice(0, MAX_TITLE) || 'Imported document';
    res.status(201).json({ id: createDoc(req.user, title, html) });
  }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'File too large (max 2 MB)' : err.message });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  return app;
}

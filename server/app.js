import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import sanitizeHtml from 'sanitize-html';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileToHtml, SUPPORTED } from './convert.js';
import { sessions } from './session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_TITLE = 200;
const MAX_CONTENT = 1_000_000;
const MAX_UPLOAD = 2 * 1024 * 1024;

// The server is the trust boundary: only the formatting the editor can produce is stored.
const SANITIZE = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a', 'code', 'pre', 'hr'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};
const clean = (html) => sanitizeHtml(html, SANITIZE);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const limiter = (windowMs, limit, extra = {}) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'Too many requests, please slow down')), ...extra });

/**
 * @param {{one: Function, all: Function, query: Function}} db
 * @param {{ sessionSecret: string, production?: boolean }} config
 */
export function createApp(db, { sessionSecret, production = false }) {
  const app = express();
  const session = sessions(sessionSecret, { secure: production });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD, files: 1 } });

  if (production) app.set('trust proxy', 1); // behind Render's proxy: real client IP for rate limits, HTTPS for Secure cookies
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: production ? [] : null } },
  }));
  app.use(express.json({ limit: '2mb' }));

  // Writes must be JSON or multipart: blocks form/text-encoded cross-site submissions (defence in depth with SameSite).
  app.use('/api', (req, _res, next) =>
    next(req.is(['application/json', 'multipart/form-data']) === false ? new HttpError(415, 'Unsupported content type') : undefined));
  app.use('/api', limiter(60_000, 300)); // general ceiling per IP

  // --- mocked auth (allowed by the brief): pick a seeded user; signed, httpOnly session cookie ---
  app.use('/api', async (req, _res, next) => {
    const id = session.read(req);
    req.user = id ? await db.one('SELECT id, name, email FROM users WHERE id = $1', [id]) : null;
    next();
  });
  const requireUser = (req, _res, next) => next(req.user ? undefined : new HttpError(401, 'Not signed in'));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/users', async (_req, res) => {
    res.json(await db.all('SELECT id, name, email FROM users ORDER BY id'));
  });
  // Only failed attempts count, so normal switching between demo users is never blocked.
  app.post('/api/login', limiter(15 * 60_000, 20, { skipSuccessfulRequests: true }), async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = await db.one('SELECT id, name, email FROM users WHERE email = $1', [email]);
    if (!user) throw new HttpError(404, 'Unknown user');
    session.set(res, user.id);
    res.json(user);
  });
  app.post('/api/logout', (_req, res) => {
    session.clear(res);
    res.json({ ok: true });
  });
  app.get('/api/me', (req, res) => res.json(req.user));

  /** Resolve the caller's effective role ('owner' | 'editor' | 'viewer') or throw 404/403. Single access gate. */
  async function loadDoc(rawId, user) {
    const id = Number.parseInt(rawId, 10);
    if (!Number.isInteger(id) || String(id) !== String(rawId)) throw new HttpError(404, 'Document not found');
    const doc = await db.one(`
      SELECT d.*, u.name AS owner_name, u.email AS owner_email, s.role AS share_role
      FROM documents d
      JOIN users u ON u.id = d.owner_id
      LEFT JOIN shares s ON s.doc_id = d.id AND s.user_id = $2
      WHERE d.id = $1`, [id, user.id]);
    if (!doc) throw new HttpError(404, 'Document not found');
    const role = doc.owner_id === user.id ? 'owner' : doc.share_role;
    if (!role) throw new HttpError(403, 'You do not have access to this document');
    return { doc, role };
  }

  app.get('/api/docs', requireUser, async (req, res) => {
    const owned = await db.all(`
      SELECT id, title, updated_at FROM documents WHERE owner_id = $1 ORDER BY updated_at DESC, id DESC`, [req.user.id]);
    const shared = await db.all(`
      SELECT d.id, d.title, d.updated_at, s.role, u.name AS owner_name
      FROM shares s JOIN documents d ON d.id = s.doc_id JOIN users u ON u.id = d.owner_id
      WHERE s.user_id = $1 ORDER BY d.updated_at DESC, d.id DESC`, [req.user.id]);
    res.json({ owned, shared });
  });

  const createDoc = async (user, title, content) =>
    (await db.one('INSERT INTO documents (title, content, owner_id) VALUES ($1, $2, $3) RETURNING id',
      [title, content, user.id])).id;

  app.post('/api/docs', requireUser, async (req, res) => {
    const title = String(req.body?.title ?? '').trim().slice(0, MAX_TITLE) || 'Untitled document';
    res.status(201).json({ id: await createDoc(req.user, title, '') });
  });

  app.get('/api/docs/:id', requireUser, async (req, res) => {
    const { doc, role } = await loadDoc(req.params.id, req.user);
    const shares = role === 'owner'
      ? await db.all(`SELECT u.id, u.name, u.email, s.role FROM shares s JOIN users u ON u.id = s.user_id
                      WHERE s.doc_id = $1 ORDER BY u.name`, [doc.id])
      : [];
    res.json({ id: doc.id, title: doc.title, content: doc.content, updated_at: doc.updated_at,
      owner: { name: doc.owner_name, email: doc.owner_email }, role, shares });
  });

  app.put('/api/docs/:id', requireUser, async (req, res) => {
    const { doc, role } = await loadDoc(req.params.id, req.user);
    if (role === 'viewer') throw new HttpError(403, 'View-only access: you cannot edit this document');
    const { title, content } = req.body ?? {};
    if (title === undefined && content === undefined) throw new HttpError(400, 'Nothing to update');
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, 'Title cannot be empty');
      if (title.trim().length > MAX_TITLE) throw new HttpError(400, `Title must be at most ${MAX_TITLE} characters`);
    }
    if (content !== undefined) {
      if (typeof content !== 'string') throw new HttpError(400, 'Content must be an HTML string');
      if (content.length > MAX_CONTENT) throw new HttpError(413, 'Document too large');
    }
    const row = await db.one(
      'UPDATE documents SET title = $1, content = $2, updated_at = now() WHERE id = $3 RETURNING updated_at',
      [title !== undefined ? title.trim() : doc.title, content !== undefined ? clean(content) : doc.content, doc.id]);
    res.json({ ok: true, updated_at: row.updated_at });
  });

  app.delete('/api/docs/:id', requireUser, async (req, res) => {
    const { doc, role } = await loadDoc(req.params.id, req.user);
    if (role !== 'owner') throw new HttpError(403, 'Only the owner can delete a document');
    await db.query('DELETE FROM documents WHERE id = $1', [doc.id]);
    res.json({ ok: true });
  });

  // --- sharing (owner only) ---
  app.post('/api/docs/:id/share', requireUser, async (req, res) => {
    const { doc, role } = await loadDoc(req.params.id, req.user);
    if (role !== 'owner') throw new HttpError(403, 'Only the owner can share this document');
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const shareRole = ['viewer', 'editor'].includes(req.body?.role) ? req.body.role : null;
    if (!shareRole) throw new HttpError(400, 'role must be "viewer" or "editor"');
    const target = await db.one('SELECT id FROM users WHERE email = $1', [email]);
    if (!target) throw new HttpError(404, `No user with email ${email || '(empty)'}`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'The owner already has full access');
    await db.query(`INSERT INTO shares (doc_id, user_id, role) VALUES ($1, $2, $3)
                    ON CONFLICT (doc_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [doc.id, target.id, shareRole]);
    res.json({ ok: true });
  });

  app.delete('/api/docs/:id/share/:userId', requireUser, async (req, res) => {
    const { doc, role } = await loadDoc(req.params.id, req.user);
    if (role !== 'owner') throw new HttpError(403, 'Only the owner can change sharing');
    await db.query('DELETE FROM shares WHERE doc_id = $1 AND user_id = $2', [doc.id, Number.parseInt(req.params.userId, 10)]);
    res.json({ ok: true });
  });

  // --- file upload -> new editable document ---
  app.post('/api/upload', requireUser, limiter(10 * 60_000, 30), upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file provided (form field name: "file")');
    // multer decodes multipart filenames as latin1; restore UTF-8 names.
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const html = clean(await fileToHtml(name, req.file.buffer));
    const title = name.replace(/\.[^.]+$/, '').trim().slice(0, MAX_TITLE) || 'Imported document';
    res.status(201).json({ id: await createDoc(req.user, title, html) });
  });
  app.get('/api/upload/supported', (_req, res) => res.json({ extensions: SUPPORTED, maxBytes: MAX_UPLOAD }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use(express.static(path.join(__dirname, '..', 'dist')));

  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'File too large (max 2 MB)' : err.message });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  return app;
}

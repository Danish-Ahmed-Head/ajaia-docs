# Code walkthrough: what every part does, and why

This document walks every source file top to bottom, explaining **why** each block exists and which library functions it relies on. Line references point at the current code; function names are given too, so this stays useful after small edits. CSS and tests are summarised at the end rather than line by line.

How the pieces fit:

```
src/ (browser) ──fetch JSON──▶ server/app.js (Express API) ──SQL──▶ server/db.js (Postgres / PGlite)
                                    │
                                    ├─ server/session.js   signed cookie
                                    └─ server/convert.js   file import → HTML
server/index.js   = local / Docker start-up       server/vercel.js + scripts/build-vercel.mjs = Vercel start-up
```

---

## 1. `server/db.js`: database connection and schema

| Lines | What | Why |
|---|---|---|
| imports | `node:fs`, `node:path`, `pg` | `pg` (node-postgres) is the standard Postgres driver. `fs`/`path` only create the local data folder |
| `SEED_USERS` | Alice, Bob, Carol | The brief allows simulated users; three are the minimum to demonstrate owner, editor and viewer |
| `SCHEMA` | 4 tables + 3 indexes, all `IF NOT EXISTS` | Idempotent: safe to run on every start, so there's no separate migration step for a reviewer to forget. `SERIAL` ids, `TIMESTAMPTZ` times (timezone-safe), `ON DELETE CASCADE` so deleting a document removes its shares and versions in the same statement. `CHECK (role IN ('viewer','editor'))` makes an invalid role impossible even if the API had a bug. Indexes match the hot queries: "documents I own", "documents shared with me", "versions of this doc, newest first" |
| `createDb({ url, dataDir })` | Picks a driver | **One interface over two drivers.** Production: `new pg.Pool({ connectionString, max: 5 })`. A pool reuses connections, and 5 is plenty for one serverless instance on Neon. Local/tests: PGlite, which is real Postgres compiled to WASM, so tests run the *same SQL* as production |
| `await import('@electric-sql/pglite')` | Lazy import | Production never needs PGlite, so it isn't loaded there. Faster cold starts, and the Vercel bundle can leave it out |
| `fs.mkdirSync(path.dirname(dataDir), { recursive: true })` | Create `./data` | PGlite only creates the last folder level; a fresh clone crashed without this (defect D6) |
| schema loop | `SCHEMA.split(';')` then run each | Both drivers accept one statement per call through this interface |
| seed loop | `INSERT … ON CONFLICT (email) DO NOTHING` | Re-running is harmless |
| `one` / `all` | Helpers | Return the first row (or `null`) / all rows, so route code stays one line |
| `kind` | `'postgres' \| 'pglite'` | Lets `/api/health` show which database is live (catches a missing `DATABASE_URL` in seconds) |

**Libraries:** `pg.Pool#query(text, params)` sends a **parameterised** query (`$1, $2 …`). Values never get pasted into SQL, which is what prevents SQL injection. `PGlite#query` has the same signature, which is why one interface fits both.

---

## 2. `server/session.js`: the signed session cookie

| Lines | What | Why |
|---|---|---|
| `COOKIE = 'sid'`, `MAX_AGE_S` 7 days | Constants | A short neutral name; a week is reasonable for a demo |
| secret length check | `>= 32` chars | A short secret could be brute-forced; this fails at start-up instead of shipping something weak |
| `mac(v)` | `crypto.createHmac('sha256', secret).update(v).digest('base64url')` | HMAC-SHA256 signs the user id. Without the secret nobody can produce a valid signature, so changing `sid=1` to `sid=2` gets rejected |
| `attrs` | `HttpOnly; SameSite=Lax; Secure` (production) | `HttpOnly`: JavaScript can't read it, so a hypothetical XSS can't steal it. `SameSite=Lax`: not sent on cross-site POSTs (CSRF defence). `Secure`: HTTPS only |
| `read(req)` | Parse header → split `id.sig` → `/^\d+$/` → compare | Strict format check first, then `crypto.timingSafeEqual` so the comparison takes the same time whether the first or the last byte differs (no timing attack). The length check runs first because `timingSafeEqual` throws on unequal lengths |
| `set` / `clear` | `res.append('Set-Cookie', …)` | `append` (not `setHeader`) so other cookies are never overwritten. `clear` sets `Max-Age=0` |

---

## 3. `server/convert.js`: file import

| Lines | What | Why |
|---|---|---|
| `esc` | Escape `& < >` | Text from a file is *data*: `<b>` typed in a `.txt` must show as the characters `<b>`, not become bold |
| `inline(s)` | Escape, then `**bold**`/`*italic*` | Escaping happens **first**, so only our own tags can appear |
| `markdownToHtml` | Line-by-line state machine | A tiny, predictable subset (headings 1–3, lists, emphasis, paragraphs) rather than a full Markdown library. Everything it emits is on the sanitiser's allow-list. `flushPara`/`closeList` close open blocks when the kind of line changes |
| `textToHtml` | Split on blank lines → `<p>`; single newlines → `<br>` | Keeps the author's paragraphing |
| `SUPPORTED` | `.txt .md .docx` | Single source of truth, also served at `/api/upload/supported` and quoted in error messages |
| `fileToHtml` | Dispatch by extension (`lastIndexOf('.')`, lower-cased) | `x.docx.exe` → `.exe` → rejected. `.DOCX` works |
| `.docx` | `mammoth.convertToHtml({ buffer })` inside try/catch | mammoth maps Word styles to clean HTML. A corrupt file now becomes a clear **422** instead of a 500 |
| unsupported | `status = 415` | The right HTTP code for "unsupported media type" |

---

## 4. `server/app.js`: the API (the core)

### Setup (top of file)
| Code | Why |
|---|---|
| `MAX_TITLE 200`, `MAX_CONTENT 1_000_000`, `MAX_UPLOAD 2 MB` | Hard limits at the trust boundary; no request can store unbounded data |
| `SANITIZE` allow-list + `clean()` | **Every** stored HTML string goes through `sanitizeHtml(html, SANITIZE)`: only the tags the editor can produce, `href` only on links, only `http/https/mailto` URLs (so no `javascript:`). The browser editor also filters, but the server never trusts the client |
| `class HttpError` | Errors carry an HTTP status, so route code just `throw`s and one error handler formats the response |
| `limiter(windowMs, limit, extra)` | Wraps `express-rate-limit`. `standardHeaders: 'draft-8'` sends the modern `RateLimit` header; the `handler` routes 429s through our JSON error format |

### `createApp(db, { sessionSecret, production })`
A factory, not a global app. Tests create a fresh app on an in-memory database for each suite, and production and Vercel pass their own config.

| Code | Why |
|---|---|
| `multer({ storage: memoryStorage(), limits: { fileSize, files: 1 } })` | Uploads stay in memory (nothing written to disk on a serverless host); the size and count limits stop abuse before parsing |
| `app.set('trust proxy', 1)` (production) | Vercel/Render sit behind one proxy; this makes `req.ip` the real client (rate limits) and `req.secure` correct |
| `app.disable('x-powered-by')` | Don't advertise the framework |
| `helmet({ contentSecurityPolicy: … })` | Sets CSP, `nosniff`, frame protection, HSTS and more. `upgradeInsecureRequests` is off in development so `http://localhost` keeps working |
| `express.json({ limit: '2mb' })` | Parses JSON bodies with a size cap |
| content-type guard | Writes must be JSON or multipart. An HTML `<form>` on another site can only send form-encoded/plain bodies, so this blocks it (defence in depth with `SameSite`). It checks `content-length > 0` because `type-is` counts an empty body as a body, which had broken logout (defect found by E2E) |
| `limiter(60_000, 300)` | General per-IP ceiling for the whole API |
| session middleware | `session.read(req)` → look the user up → `req.user` (or `null`) |
| `requireUser` | 401 for every route that needs a signed-in user |

### Routes
| Route | Key lines | Why |
|---|---|---|
| `GET /api/health` | `{ ok, db: db.kind }` | Liveness check, plus proof of which database is connected |
| `GET /api/users` | `ORDER BY id` | Feeds the demo sign-in screen and the share picker |
| `POST /api/login` | `limiter(15 min, 20, { skipSuccessfulRequests: true })` | Brute-force guard that counts only **failed** attempts, so switching demo users never locks anyone out. Email is trimmed and lower-cased |
| `POST /api/logout` | `session.clear` | |
| `GET /api/me` | `req.user` | The frontend asks "am I signed in?" on load |
| **`loadDoc(rawId, user)`** | `parseInt` + `String(id) !== rawId` → 404; one SQL with `LEFT JOIN shares` → role | **The single access gate.** Every document route calls it. Rejects `1e3`, `01` and `abc` as not-found (no type confusion). One query fetches the document, its owner and *your* share row; role = owner, else your share role, else **403**. Returning 404 for missing and 403 for not-shared is a deliberate choice: a demo with three users gains nothing from hiding existence |
| `GET /api/docs` | Two queries | "Owned" and "Shared with me" lists, newest first; `id DESC` breaks ties deterministically |
| `POST /api/docs` | Title trimmed, capped, default "Untitled document" | |
| `GET /api/docs/:id` | Share list only for the owner | Editors and viewers can't see who else has access |
| `PUT /api/docs/:id` | Viewer → 403; validate types and sizes; `clean(content)`; `UPDATE … RETURNING updated_at`; `recordVersion` | Partial updates (title or content). `updated_at` is returned so the client knows the server's timestamp (the presence banner compares it) |
| `recordVersion` | `UPDATE … WHERE id = (latest) AND same author AND note IS NULL AND started_at > now() - 10 min` else `INSERT` | Autosave fires every second or so. Without folding, history would have thousands of entries. One version per author per 10-minute session; a different author, a restore or an import always starts a new one. It's a single SQL statement, so "is the latest mine and recent?" and "update it" can't be split by another request |
| `GET …/versions` | `LIMIT 100` (the stored cap) | Bounded response; every stored version is reachable |
| `loadVersion` | `WHERE v.id = $1 AND v.doc_id = $2` | **IDOR guard:** a version id from another document is "not found", even if you can access *this* document (tested) |
| `POST …/restore` | Viewer → 403; copy title/content back; record a version with a note | A restore can itself be undone |
| presence | `Map(docId → Map(userId → {name, at}))`, 30 s TTL, prune on each ping | Shows who else has the document open. In memory by design (the `shortcut:` comment marks the limit). It also returns `updated_at` and the last editor for the "updated" banner |
| `DELETE /api/docs/:id` | Owner only | Cascades in SQL |
| `POST …/share` | Owner only; role allow-list; email must exist; can't share with yourself; `INSERT … ON CONFLICT DO UPDATE` | Re-sharing changes the role instead of duplicating (an upsert, atomic in Postgres) |
| `DELETE …/share/:userId` | Owner only | Revokes immediately |
| `POST /api/upload` | `requireUser` → rate limit → multer → `fileToHtml` → `clean` → create → version with note | The filename is re-decoded from latin1 to UTF-8 (multer/busboy quirk, tested with "Résumé"). The title comes from the filename minus its extension |
| `app.use('/api', 404)` | | Unknown API paths get JSON, not an HTML page |
| `express.static('dist')` | | Serves the built frontend for local/Docker runs (Vercel serves it from its CDN instead) |
| error handler | Multer limits → 413/400; JSON parse → 400; body too large → 413; else `err.status` or 500 | One consistent `{ error }` shape. **5xx details are logged, never sent** to the client |

---

## 5. Start-up files

### `server/index.js` (local and Docker)
- `production = NODE_ENV === 'production'`.
- No `SESSION_SECRET`: production refuses to start; development generates a random one (sessions reset on restart, which is fine locally).
- `DATABASE_URL` → Postgres. `DB_IN_MEMORY=1` → throwaway database (used by the E2E tests). Otherwise PGlite in `./data`.
- `createApp(...).listen(PORT)`.

### `server/vercel.js` (Vercel)
- Vercel calls `export default handler(req, res)` per request; there's no `listen()`.
- `appPromise ??= init()`: the app and its connection pool are created **once per warm instance** and reused across requests.
- `init` is `async` so a missing secret becomes a rejected promise. The `try/catch` then returns a clean JSON 500 and resets `appPromise`, so the next request retries (useful while Neon wakes up). The test suite caught the synchronous-throw version of this.
- On Vercel, a missing `DATABASE_URL` is an error, not a silent fallback to a database that loses data.

### `scripts/build-vercel.mjs` (why it exists)
Vercel's function loader can't `require()` an ESM-only package from CommonJS (`sanitize-html` → `htmlparser2` v12). Production returned 500 on every call, while local Node 24 was fine. Downgrading `sanitize-html` would have brought back two published XSS advisories, so instead:
- `esbuild.build({ bundle: true, format: 'esm', platform: 'node' })` puts the server and every dependency into **one file**, so nothing is loaded from `node_modules` at runtime.
- The `external` list covers `pg-native` (optional, never used) and PGlite (local only).
- The `banner` gives the ES module a real `require` for Node built-ins that bundled CommonJS code still asks for.
- It writes Vercel's **Build Output API v3** layout:
  - `static/`: the Vite build
  - `functions/api.func/` with `.vc-config.json`: runtime, region `pdx1`, handler
  - `config.json` with the routes: security headers on everything, `/api` and `/api/*` to the function, then the static files.

---

## 6. `src/index.html`: the page

| Part | Why |
|---|---|
| `<meta name="color-scheme" content="light dark">` | Native form controls follow the theme |
| Inline SVG sprite (`<symbol id="i-…">`) | One consistent icon set (24 px grid, 1.75 stroke); no icon font, no extra request; used through `<use href="#i-bold">` |
| `#login` section | Demo sign-in; the buttons are generated from `/api/users` |
| `#app` → `.topbar` (mobile), `#sidebar`, `<main>` | App shell. The sidebar becomes a slide-out drawer on phones |
| `<label for="upload">` + hidden `<input type=file>` | A styled button that opens the native file picker; still keyboard accessible |
| `#empty` | An empty state that teaches the next step instead of a blank screen |
| `.doc-header` | Title input, meta line, presence avatars, save status (`role="status" aria-live="polite"` so screen readers hear "Saving…/All changes saved"), and actions |
| `#toolbar role="toolbar"` | Every icon button has `aria-label` and a `title` with its shortcut |
| `#remote-banner`, `#readonly-banner` | Notices for "someone else changed this" and "view-only" |
| `<dialog>` × 3 (share, history, delete) | The native `<dialog>` gives focus trapping, the Esc key and a backdrop for free. `form method="dialog"` closes it with a `returnValue` (the delete dialog uses that to know "confirm" vs "cancel") |
| `#toast role="alert"` | Errors and confirmations are announced |

---

## 7. `src/app.js`: the browser app

### Helpers
| Code | Why |
|---|---|
| `$` | `getElementById` shorthand |
| `state` | All mutable UI state in one object: current user, open document, save timer, dirty flag, in-flight save promise |
| `api()` | One `fetch` wrapper. It adds the JSON header, turns network failures into `status 0`, parses the JSON error body, and calls `sessionExpired()` on any 401 (except the login call itself). `keepalive` is used only for the save on tab close (the browser caps keepalive bodies at 64 KB) |
| `unhandledrejection` listener | Any failed async action becomes a toast instead of failing silently; 401s are skipped because `sessionExpired` already handled them |
| `sessionExpired` | Stops presence, clears the document and timers, shows the sign-in screen with an explanation. Guarded so it runs once |
| `escapeHtml` | **Every** server string that goes into `innerHTML` passes through it (titles, names, emails, notes). The exceptions are document/version content, which is HTML by design and was already sanitised by the server |
| `fmtRelative` | `Intl.RelativeTimeFormat` gives localised "5 minutes ago" with no date library |
| `initials`, `hue`, `avatar` | Deterministic avatar colour from the name (a small string hash) |
| `icon(id)` | Builds an `<svg><use>` from the sprite |

### Sign-in, drawer, list
- `showLogin()` builds the person buttons. The demo role hints are a static map (frontend copy only, not a permission).
- `setNav(open)` toggles the mobile drawer, keeps `aria-expanded` correct, and moves focus into the drawer. Esc closes it.
- `refreshList()` renders both lists with `aria-current` on the open document, and switches the empty-state text depending on whether you have documents.
- `createDoc()` sets the editor area `inert` while the new document loads, so early keystrokes can't land in the previous document (a real bug the E2E suite found). It sets `selectTitleOnOpen` so the title is selected *after* the document mounts (a timer version stole focus; also found and fixed).
- The upload handler checks extension and size on the client for instant feedback; the server still enforces both.

### Editor
- `mountEditor(content, editable)`: `editor?.destroy()` then `new Editor({ element, extensions: [StarterKit.configure(...)], content, editable, onUpdate, onTransaction })`. **A fresh editor per document** so undo history never crosses documents. Code, code-block and horizontal-rule are disabled to match the server's allow-list. `link: { openOnClick: false }` means clicking a link while editing doesn't navigate away.
- `openDoc(id)`: lock (`inert`) → stop presence for the old document → `flushSave()` (if that fails and you choose to stay, the URL is restored) → fetch → mount → set read-only state for viewers (`readOnly` title, disabled toolbar, banner) → show Share/Delete only to the owner → meta, status, word count, tab title and print title → start presence.

### Presence and the "updated" banner
- `startPresence()`: pings every 10 s and skips while the tab is hidden (`document.hidden`). It ignores late responses for a document you've already left (`state.doc !== doc`). If the server's `updated_at` is newer than ours, **and** we have no unsaved edits, **and** no save of ours is in flight (`inFlight`), it shows "X updated this document · Load latest".
- `stopPresence()`: clears the timer and tells the server you left, so the avatar disappears for others within seconds instead of after 30.

### Version history
- The History button saves first (so the newest version includes your latest edit), loads the list, then selects the newest. Restore is disabled for the newest version (it's already current) and hidden for viewers. Notes like "Restored the version from 2026-…T…Z" are shown in friendlier words.

### Saving (the part that protects your work)
| Function | Why |
|---|---|
| `scheduleSave` | Debounce: save 800 ms after the last keystroke |
| `save()` | `await state.saving` first, so **only one save is ever in flight**, so an older save can't land after a newer one. Takes a snapshot of `doc` so a late response can't update the wrong document. On failure it marks dirty again; network, 429 and 5xx errors **retry after 5 s**, while validation errors wait for your next edit |
| `flushSave()` | Used before switching documents, signing out or opening history; asks before abandoning unsaved edits |
| title `Enter` | `editor.view.focus()` (synchronous) instead of Tiptap's `commands.focus()` (waits a frame and lost the next keystroke) |
| `beforeunload` | Last-chance save with `keepalive` |

### Toolbar
- `COMMANDS` maps each button to a Tiptap chain: `editor.chain().focus().toggleBold().run()`. `chain()` batches commands into one transaction, and `focus()` keeps the cursor in the document.
- `mousedown` + `preventDefault` stops the button from stealing focus, so the selection stays put.
- `updateToolbar()` runs on every transaction. `editor.isActive('bold')` lights the button; `editor.can().undo()` disables undo when there's nothing to undo; the heading select reflects the current block.

### Delete, export, sharing, routing
- Delete opens a native `<dialog>`, and the `close` event's `returnValue` decides.
- `htmlToMarkdown`: a small recursive DOM walk (headings, emphasis, lists, quotes, links) producing Markdown that round-trips through the importer.
- Export creates a Blob and a temporary `<a download>`.
- `renderShareList` shows each person with an inline role `<select>` (a change posts the same upsert endpoint) and a remove button.
- The share picker is filled **once** per dialog open, which fixed a race where it reset mid-selection.
- Routing is hash-based (`#/doc/12`): no server routes are needed, so it works on any static host.
- `boot()` loads the current user → shows the app or sign-in → loads lists → opens the document in the URL.

---

## 8. Libraries and the functions used

| Library | Version | Functions used | Purpose |
|---|---|---|---|
| express | 5.2.1 | `express()`, `app.use/get/post/put/delete`, `express.json`, `express.static`, `req.is`, `res.status().json()` | HTTP API. v5 forwards rejected promises to the error handler |
| helmet | 8.3.0 | `helmet({ contentSecurityPolicy })` | Security headers |
| express-rate-limit | 8.7.1 | `rateLimit({ windowMs, limit, standardHeaders, legacyHeaders, handler, skipSuccessfulRequests })` | Abuse limits |
| multer | 2.4.0 | `multer({ storage: memoryStorage(), limits })`, `.single('file')`, `MulterError` | Multipart upload (CVE-patched v2) |
| sanitize-html | 2.18.0 | `sanitizeHtml(html, { allowedTags, allowedAttributes, allowedSchemes })` | Server-side XSS defence |
| mammoth | 1.13.0 | `convertToHtml({ buffer })` | `.docx` → HTML |
| pg | 8.23.1 | `new Pool({ connectionString, max })`, `pool.query(text, params)`, `pool.end()` | Postgres in production |
| @electric-sql/pglite | 0.5.8 | `new PGlite(dir?)`, `.query`, `.close` | Same-SQL Postgres for local runs and tests |
| @tiptap/core + starter-kit | 3.31.4 | `new Editor`, `StarterKit.configure`, `chain/focus/toggle*/setHeading/setParagraph/undo/redo`, `isActive`, `can`, `getHTML`, `getText`, `destroy`, `view.focus` | The editor |
| vite | 8.3.3 | `vite build` | Bundles the frontend |
| esbuild | 0.28.2 | `build({ bundle, format, platform, external, banner })` | Bundles the API for Vercel |
| Node built-ins | — | `crypto.createHmac`, `crypto.timingSafeEqual`, `crypto.randomBytes`, `fs`, `path`, `url.fileURLToPath`, `node:test`, `assert` | Signing, files, tests |
| @playwright/test | 1.64.0 | `test`, `expect`, `page.*`, `browser.newContext` | Browser tests in real Chrome |
| eslint 10, docx 9.9 | — | Lint; generating a real `.docx` in a test | Quality and test fixtures |

## 9. What changed after the independent code review (D9–D24 in `docs/SDLC.md`)

Two reviewers read every line without seeing my reasoning. Every finding was checked against the code before changing anything, and each fix has a regression test.

| Where | New code | Why |
|---|---|---|
| `db.js` | `pool.on('error', …)`, `idleTimeoutMillis: 10_000` | pg emits `'error'` when the server drops an idle connection (Neon's auto-suspend does exactly this). With no listener, Node treats it as an uncaught exception and the process dies |
| `db.js` | Schema sent once, wrapped in `BEGIN; SELECT pg_advisory_xact_lock(…); … COMMIT;`, seed as a single `INSERT … VALUES (…),(…),(…)` | Two round trips instead of ten on every cold start, and two instances starting at the same moment can't race on `CREATE TABLE IF NOT EXISTS` |
| `db.js` | `tx(fn)`: `BEGIN/COMMIT/ROLLBACK` on a pooled client (pg) or `lite.transaction` (PGlite) | Saving a document and recording its version now succeed or fail together |
| `db.js` | Close the pool if start-up fails | No leaked connections; the next request retries with a fresh pool |
| `app.js` | `toId()` | Accepts only 1 to 2,147,483,647 (Postgres `INTEGER`). Anything else is a 404, not a database error and a 500 |
| `app.js` | `transformTags` forcing `rel="noopener noreferrer nofollow"` | A stored link can't let the linked page take over the reader's tab |
| `app.js` | `MAX_VERSIONS_PER_DOC = 100` prune after each new version | Two people taking turns can't grow history without limit |
| `app.js` | `receiveFile` wrapper around multer | A truncated multipart body is the client's fault: 400 |
| `app.js` | Global limit 600/min | One office behind a single IP shouldn't hit the limit through normal use |
| `convert.js` | `zipExpandedSize(buf)`: reads the zip central directory (signature `0x02014b50`, uncompressed size at offset 24) without inflating; ZIP64 or a broken directory counts as too big | Stops a 2 MB `.docx` that would expand to gigabytes inside mammoth |
| `index.js` | Production requires `DATABASE_URL` | Never silently store real data in a throwaway database |
| `src/app.js` | `closeDocView()` | Destroys the editor and hides the document on sign-out and session expiry, so the next person never sees the previous one's document |
| `src/app.js` | `delete-dialog.returnValue = ''` before `showModal()` | A `<dialog>` remembers its last answer, and Escape doesn't change it: without the reset, Escape after an earlier delete would delete again |
| `src/app.js` | `state.openSeq` | If you click two documents quickly, only the last one opens |
| `src/app.js` | `if (historySelected !== v) return` | The preview always shows the version that Restore will restore |
| `src/app.js` | `accessMayHaveChanged(err)` | If the owner downgrades or removes you while the document is open, the next save or presence check reloads it with your real role |
| `src/app.js` | Overwrite warning toast | If someone else changed the document and you keep typing, you're told your save will replace their version (it stays in History) |
| `src/app.js` | `wrapMark`, `listItem`, `br → '  \n'` | Valid Markdown for nested lists, emphasis with spaces, and hard line breaks |
| `src/app.js` | Drawer `inert` when closed on phones; Text-style select keeps focus for arrow keys | Keyboard and screen-reader users don't tab into a hidden menu and can reach Heading 2/3 |
| `src/app.js` | List refresh only when the title changed or every 30 s | Halves API calls while typing (this is what tripped the rate limit) |

## 10. Styles and tests (summary)
- **`style.css`:**
  - Design tokens in `:root`, redefined for dark mode under `prefers-color-scheme`.
  - Themed browser surfaces: selection, focus ring, caret, scrollbar.
  - One button system.
  - Sidebar layout that becomes a drawer below 760 px.
  - A `@media print` block that prints only the document (Export PDF).
  - `prefers-reduced-motion` turns animations off.
- **Tests:** 40 API tests (`test/*.test.js`) over real HTTP against in-memory Postgres, 18 Playwright browser tests (`e2e/`), and a live smoke script (21 checks) run against the deployed URL. See `docs/TESTING.md`.

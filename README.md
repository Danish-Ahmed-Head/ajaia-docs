# Ajaia Docs: lightweight collaborative document editor

Create, rename and edit rich-text documents, import files, and share documents with other users as **editor** or **viewer**.

**Live demo:** _<add Render URL>_. The free tier sleeps after 15 minutes idle, so the first load can take about a minute.
**Walkthrough video:** see `VIDEO_URL.txt`

## Test accounts (mocked auth, no passwords)

On the sign-in screen, pick a user. Use **Switch user** (bottom-left) to change who you are.

| User | Email | Use it to… |
|---|---|---|
| Alice Owner | alice@example.com | create and share documents |
| Bob Editor | bob@example.com | receive **can edit** access |
| Carol Reviewer | carol@example.com | receive **view only** access |

### 2-minute review script
1. Sign in as **Alice**, click **+ New document**, type a title, then write. Use the toolbar (text style, **B**, *I*, U, S, bulleted and numbered lists, quote, undo/redo) or shortcuts (Ctrl+B/I/U, `# ` for a heading, `- ` for a list).
2. The status shows "All changes saved" (autosave about 0.8 s after you stop typing). **Refresh**: content and formatting are still there.
3. Click **Share**. Add Bob as *Can edit* and Carol as *Can view*.
4. **Switch user** to Bob. The doc appears under **Shared with me** with a "can edit" badge; Bob can edit.
5. **Switch user** to Carol. The doc is view-only: a banner shows, the toolbar is disabled, and the API also returns 403 on writes.
6. Click **Import file** and pick a `.txt`, `.md` or `.docx` file (max 2 MB). It becomes a new editable document you own.
7. **Export .md** downloads the document as Markdown.

## Run locally

Requires **Node.js 22.12 or newer**. No database setup is needed: without `DATABASE_URL`, the app uses an embedded Postgres (PGlite) stored in `./data/`.

```bash
npm install
npm run dev        # builds the frontend, then serves http://localhost:3000
npm test           # 5 API tests against in-memory Postgres (PGlite)
```

| Env var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | unset → PGlite in `./data/pglite` | Postgres connection string (production: Neon) |
| `PORT` | `3000` | HTTP port |

Delete `./data/` to reset local data. The three users are re-seeded on start.

## Supported file import
| Type | Conversion |
|---|---|
| `.txt` | Paragraphs split on blank lines; text is escaped |
| `.md` | Headings (`#`–`###`), `**bold**`, `*italic*`, bulleted and numbered lists, paragraphs |
| `.docx` | Converted with `mammoth` (paragraphs, headings, bold/italic, lists, links) |

Anything else returns HTTP 415 with the supported list. The limit is shown in the UI next to the Import button.

## Deploy (free: Render + Neon)
1. Create a free Neon project and copy its connection string.
2. Push this repo to GitHub, then in Render choose **New → Blueprint** and select the repo (`render.yaml` is included).
3. Paste the Neon string into the `DATABASE_URL` env var in the Render dashboard. Never commit it.
4. Open `/api/health` to confirm the service is up. Tables and seed users are created automatically on first boot.

`Dockerfile` is included for any container host as an alternative.

## Project layout
```
server/app.js      Express 5 API: auth, documents, access control, sharing, upload, validation, errors
server/db.js       Postgres schema + seed; pg (production) or PGlite (dev/test) behind one query() interface
server/convert.js  .txt / .md / .docx → HTML
src/               Frontend: index.html, app.js (Tiptap 3 editor), style.css. Built by Vite into dist/
test/api.test.js   API tests over real HTTP against in-memory Postgres
docs/              DECISIONS.md (ADRs), SDLC.md (process, defect log)
```

More: `ARCHITECTURE.md` (design and trade-offs), `AI_WORKFLOW.md` (how AI was used), `docs/DECISIONS.md` (every tech choice with evidence).

## Known limitations
- Auth is mocked by design: anyone can pick any seeded user.
- No real-time co-editing; last write wins.
- `npm audit` reports 3 moderate findings in `mammoth` → `argparse` → `sprintf-js`. They are used only by mammoth's CLI, not by the library API this app calls (see ADR-005).

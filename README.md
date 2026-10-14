# Ajaia Docs — lightweight collaborative document editor

A small full-stack document editor: create, rename, edit with rich text, import files, and share documents with other users as **editor** or **viewer**.

**Live demo:** _<add deployment URL>_
**Walkthrough video:** see `VIDEO_URL.txt`

## Test accounts (mocked auth)

There are no passwords. On the sign-in screen, pick one of the seeded users. Use **Switch user** (bottom-left) to change who you are.

| User | Email | Suggested role in the demo |
|---|---|---|
| Alice Owner | alice@example.com | Creates and shares documents |
| Bob Editor | bob@example.com | Gets **can edit** access |
| Carol Reviewer | carol@example.com | Gets **view only** access |

### 2-minute review script
1. Sign in as **Alice**, click **+ New document**, type a title, then write some text. Use the toolbar for headings, bold, italic, underline, and lists.
2. The status shows "All changes saved" (autosave fires about 0.8 s after you stop typing). Refresh the page: content and formatting are still there.
3. Click **Share**. Add Bob as *Can edit* and Carol as *Can view*.
4. **Switch user** to Bob. The doc appears under **Shared with me** with a "can edit" badge, and Bob can edit it.
5. **Switch user** to Carol. The doc is view-only: a banner shows, the toolbar is disabled, and the API also rejects writes.
6. Click **Import file** and pick a `.txt`, `.md` or `.docx` file (max 2 MB). It becomes a new editable document.
7. **Export .md** downloads the current document as Markdown.

## Run locally

Requires **Node.js 22.5+**, because it uses the built-in `node:sqlite`. No other services are needed.

```bash
npm install
npm start          # http://localhost:3000
npm test           # API tests (node:test)
```

Data is stored in `./data/docs.db` (SQLite). Set `DATA_DIR` to change the location and `PORT` to change the port. Delete the file to reset; users are re-seeded on start.

## Supported file import
- `.txt`: paragraphs split on blank lines
- `.md`: headings (`#`–`###`), `**bold**`, `*italic*`, bulleted and numbered lists, paragraphs
- `.docx`: converted with `mammoth` (headings, bold/italic, lists)

Other types are rejected with a clear error (HTTP 415), and the limit is shown in the UI.

## Deploy
The included `Dockerfile` runs on any container host (Render, Railway, Fly.io). Mount a persistent volume at `/data` so documents survive restarts. On free tiers without a disk, the database resets when the instance restarts. That is fine for a demo but noted as a limitation.

## Project layout
```
server/app.js      Express app: auth, documents, sharing, upload, validation, errors
server/db.js       SQLite schema + seeded users
server/convert.js  .txt / .md / .docx → HTML
public/            Vanilla JS frontend (index.html, app.js, style.css)
test/api.test.js   End-to-end API tests against an in-memory DB
```

See `ARCHITECTURE.md` for decisions and trade-offs, and `AI_WORKFLOW.md` for how AI was used.

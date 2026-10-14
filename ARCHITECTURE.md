# Architecture note

## Goal for the timebox
Ship one coherent slice that reviewers can test end to end in a few minutes: **create → edit with formatting → autosave → reopen → share with roles → see the access difference**, plus file import. I put depth into correctness of access control and persistence rather than breadth of editor features.

## Stack and why
| Layer | Choice | Reason |
|---|---|---|
| Server | Node + Express | Small, well known, quick to review |
| Storage | SQLite via built-in `node:sqlite` | Real relational model (users, documents, shares) with zero setup and no native build step |
| Editor | `contenteditable` + browser editing commands, vanilla JS | No build pipeline, instant load, covers the required formatting. Trade-off below |
| Import | `mammoth` for .docx, small hand-written converters for .txt and .md | .docx is the format real teams have |
| Tests | `node:test` with real HTTP calls against an in-memory DB | No extra test framework; tests exercise the real routes |

## Data model
- `users(id, name, email)`: seeded with 3 users
- `documents(id, title, content HTML, owner_id, created_at, updated_at)`
- `shares(doc_id, user_id, role ∈ {viewer, editor})`, primary key `(doc_id, user_id)`, cascades on document delete

Content is stored as **sanitised HTML**. That keeps formatting exactly as edited and makes import and export simple.

## Access control (the core logic)
A single function, `loadDoc(id, user)`, resolves the caller's effective role (`owner` | `editor` | `viewer`) or throws 404 or 403. Every document route goes through it:
- read: any role
- edit (title or content): owner or editor
- delete and manage sharing: owner only

The UI mirrors these roles (read-only banner, disabled toolbar, hidden Share and Delete buttons). **The server is the enforcement point**, and the tests cover it.

## Security and validation
- All HTML is sanitised **on the server** with `sanitize-html` and an allow-list that matches the editor's formatting, so a crafted API call cannot store `<script>` or event handlers. The editor pastes as plain text to keep content predictable.
- Input validation: title required and at most 200 characters, content must be a string and at most 1 MB, JSON parse errors return 400, uploads are limited to 2 MB and an extension allow-list (415 otherwise).
- Consistent JSON error shape `{ error }`. 500s are logged and never leak internals.

## Deliberate scope cuts
- **Auth is mocked** (choose a seeded user; the user id is kept in an httpOnly cookie). This is not secure, by design, for the demo. Real version: OAuth or magic link with signed sessions.
- **No real-time co-editing.** Saves are last-write-wins. A real version would use a CRDT (Yjs) over WebSockets. I didn't add a half-working version.
- **Editor engine:** the browser's editing commands are deprecated but universally supported. For production I would move to Tiptap or ProseMirror, which give a structured document model, schema-enforced formatting, and a path to collaboration.
- No version history, comments, or attachments. Export to Markdown was the one small stretch item.

## What I'd build next (2–4 hours)
1. Swap the editor to Tiptap (same HTML storage, so no migration needed).
2. Optimistic concurrency: send `updated_at` with saves and warn on conflicting edits.
3. Real auth (magic link) and invite-by-email for users who don't exist yet.
4. Version history (snapshot table on save), plus a Playwright test for the UI flow.

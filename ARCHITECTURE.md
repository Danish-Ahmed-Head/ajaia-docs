# Architecture note

## What I prioritised
One coherent slice a reviewer can test end to end in a few minutes: **create → edit with real formatting → autosave → reopen → share with roles → see the access difference**, plus file import. I put depth into **access-control correctness, durable persistence and a well-formed document model** rather than breadth of editor features. Every technology choice, with its evidence, is in `docs/DECISIONS.md`.

```
Browser (Vite-built vanilla JS + Tiptap 3)
   │  JSON over fetch, httpOnly cookie identifies the user
   ▼
Express 5 API ── loadDoc(): single access gate → owner | editor | viewer | 403/404
   │             sanitize-html allow-list on every write
   ▼
Postgres (Neon in production · PGlite in dev/tests: same SQL)
```

## Stack
| Layer | Choice (stable versions) | Why |
|---|---|---|
| Editor | Tiptap 3.31.4 (ProseMirror), StarterKit | Schema-enforced, well-formed HTML; covers bold, italic, underline, strike, H1–H3, lists, quote and undo out of the box; standard path to Yjs collaboration |
| Frontend | Vanilla JS bundled by Vite 8.3 | No framework needed for one screen; small and fast to review |
| API | Express 5.2.1 | Async errors go to the error handler natively, so there's no try/catch boilerplate |
| DB | Postgres: `pg` 8.23 (Neon) / PGlite 0.5.8 (dev, tests) | Durable on a free host. Tests run the same SQL dialect as production with zero setup |
| Upload | multer 2.4 (memory, 2 MB, 1 file), mammoth 1.13 | Current, CVE-patched upload handling; .docx is what teams actually have |

## Data model
- `users(id, name, email UNIQUE)`: 3 seeded users
- `documents(id, title, content, owner_id → users, created_at, updated_at)`
- `shares(doc_id → documents ON DELETE CASCADE, user_id → users, role ∈ {viewer, editor}, PK(doc_id, user_id))`

Content is stored as **sanitised HTML** produced by Tiptap. That preserves formatting exactly and keeps import and export simple. A JSON document model would be the choice once collaboration lands.

## Access control
`loadDoc(id, user)` is the single gate. One query joins the document, its owner and the caller's share row, then returns the effective role or throws 404/403.

| Action | owner | editor | viewer | no access |
|---|---|---|---|---|
| Read | ✓ | ✓ | ✓ | 403 |
| Edit title or content | ✓ | ✓ | 403 | 403 |
| Share, unshare, delete | ✓ | 403 | 403 | 403 |

The UI mirrors this (read-only banner, disabled toolbar, hidden Share and Delete), but **the server is the enforcement point**. Tests call the API directly as each role.

## Validation and error handling
- Title required, trimmed, at most 200 characters. Content must be a string, at most 1 MB. Updates must contain at least one field. Non-numeric IDs return 404.
- Uploads: 2 MB, one file, extension allow-list (415 otherwise). UTF-8 filenames are preserved (multipart names arrive as latin1; this is covered by a test).
- Errors always come back as JSON `{ error }`. Malformed JSON returns 400, oversized requests 413. 5xx errors are logged server-side and never leak internals.
- Server-side HTML sanitising (defence in depth, even though Tiptap's schema already filters pasted content).

## Deliberate scope cuts
| Cut | Why | Production path |
|---|---|---|
| Mocked auth | Allowed by the brief; spends the time on sharing logic instead | OAuth or magic link, signed sessions, invite-by-email |
| Simultaneous co-editing | A half-built version would hurt more than help; presence plus a "Load latest" notice covers awareness | Yjs + Tiptap Collaboration over WebSockets |
| Comments, suggestion mode, attachments | Comments need anchored ranges that survive edits; too big to do well in the timebox | Tiptap comment marks + a `comments` table |
| React / Next.js | One screen doesn't need it; it would add risk inside the timebox | Next.js 16 if this grows into a multi-page product |

## Stretch items built after the core was finished
| Item | Design | Trade-off |
|---|---|---|
| Version history | `document_versions` table. One person's autosaves are folded into one version per 10-minute session; a different author, a restore or an import starts a new version. Restore is itself recorded, so it can be undone | Stores full HTML per version (simple and fast to restore); a diff store would save space at scale |
| Presence indicators | Each open document pings `/presence` every 10 s; the server keeps a 30 s in-memory list per document and returns who else is there plus the document's `updated_at`, which triggers the "updated this document" notice | In-memory, so a single instance only; polling, not WebSockets. Fine for a demo, and the upgrade path is Redis or Yjs awareness |
| Export PDF | A print stylesheet hides the app and prints only the title and document; the browser's Save as PDF does the rest | No server-side PDF library to maintain; output depends on the browser |
| Roles beyond basic access | Owner / editor / viewer with in-place role changes, all enforced in `loadDoc()` | No custom roles or per-section permissions |

## Next 2–4 hours
1. Optimistic concurrency: send `updated_at` with each save and return 409 on conflicting edits.
2. Comments anchored to text ranges.
3. Magic-link auth and invite-by-email for users who don't exist yet.
4. Move presence to Redis (or Yjs awareness over WebSockets) so it works across instances.

# Submission — Danish Ahmed, AI-Native Full Stack Developer

## Links
- **Live app:** _<deployment URL>_
- **Walkthrough video:** see `VIDEO_URL.txt`
- **Source:** this folder (also _<GitHub URL, optional>_)

## Test accounts
No passwords. Pick a user on the sign-in screen; use **Switch user** to change.
- alice@example.com: owner flow
- bob@example.com: share as *Can edit*
- carol@example.com: share as *Can view*

## What's included
| File / folder | Purpose |
|---|---|
| `server/`, `public/` | Source code (Express + SQLite backend, vanilla JS frontend) |
| `test/api.test.js` | Automated API tests (`npm test`) |
| `README.md` | Setup, run instructions, review script |
| `ARCHITECTURE.md` | Architecture note: priorities and trade-offs |
| `AI_WORKFLOW.md` | AI workflow note |
| `SUBMISSION.md` | This file |
| `VIDEO_URL.txt` | Walkthrough video link |
| `Dockerfile` | Container build used for deployment |
| `screenshots/` | Screenshots of the main flows |

## Status
**Working end to end:** create, rename, rich-text editing (H1–H3, bold, italic, underline, strikethrough, bulleted and numbered lists, undo/redo), autosave, reopen after refresh, import .txt/.md/.docx as a new document, share with editor or viewer roles, owned vs shared lists, view-only enforcement (UI and API), owner-only delete and sharing, export to Markdown.

**Intentionally not built:** real auth, real-time co-editing, comments, version history, attachments.

**Next 2–4 hours:** Tiptap editor, conflict detection on save, magic-link auth, version history, Playwright UI test.

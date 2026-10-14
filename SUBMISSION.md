# Submission: Danish Ahmed, AI-Native Full Stack Developer (Ajaia)

## Links
- **Live app:** _<Render URL>_. The first load after idle can take about a minute (free tier).
- **Walkthrough video:** in `VIDEO_URL.txt`
- **Source:** this folder (also _<GitHub URL>_)

## Test accounts
No passwords. Pick a user on the sign-in screen; use **Switch user** to change.
- `alice@example.com`: owner flow
- `bob@example.com`: share as *Can edit*
- `carol@example.com`: share as *Can view*

## What's included
| Path | What it is |
|---|---|
| `server/`, `src/` | Source code: Express 5 + Postgres API; Tiptap 3 frontend built with Vite |
| `test/api.test.js` | Automated API tests (`npm test`, 5 tests) |
| `README.md` | Local setup, run instructions, review script, deploy steps |
| `ARCHITECTURE.md` | Architecture note: priorities, access model, trade-offs |
| `AI_WORKFLOW.md` | AI workflow note |
| `docs/DECISIONS.md` | Decision log: every tech choice with options, evidence, accept/reject reasons |
| `docs/SDLC.md` | Process record: phases, who/when/what/why, defect log |
| `SUBMISSION.md` | This file |
| `VIDEO_URL.txt` | Walkthrough video link |
| `Dockerfile`, `render.yaml` | Deployment config |
| `screenshots/` | Owner editing view; viewer read-only view |

## Status
**Working end to end:**
- Create, rename and edit documents with rich text: H1–H3, bold, italic, underline, strikethrough, bulleted and numbered lists, quote, undo/redo.
- Autosave; reopen after refresh with formatting intact.
- Import .txt, .md or .docx as a new document.
- Share as editor or viewer; owned and shared lists are separate.
- View-only access enforced in both the UI and the API; delete and sharing are owner-only.
- Export to Markdown.

**Intentionally not built:** real auth, real-time co-editing, comments, version history, attachments. Reasons are in `ARCHITECTURE.md`.

**Next 2–4 hours:** conflict detection on save, Playwright UI test, magic-link auth, version history.

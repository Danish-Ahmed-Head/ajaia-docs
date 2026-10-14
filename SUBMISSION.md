# Submission: Danish Ahmed, AI-Native Full Stack Developer (Ajaia)

## Links
- **Live app:** _<Vercel URL>_
- **Walkthrough video:** in `VIDEO_URL.txt`
- **Source:** https://github.com/Danish-Ahmed-Head/ajaia-docs (and this folder)

## Test accounts
No passwords. Pick a user on the sign-in screen; use **Switch user** to change.
- `alice@example.com`: owner flow
- `bob@example.com`: share as *Can edit*
- `carol@example.com`: share as *Can view*

## What's included
| Path | What it is |
|---|---|
| `server/`, `src/` | Source code: Express 5 + Postgres API; Tiptap 3 frontend built with Vite |
| `test/` | 26 API tests (`npm test`); `e2e/` 10 browser tests (`npm run test:e2e`) |
| `docs/TESTING.md` | Test strategy, mutation check, 10-minute manual test script |
| `docs/DEPLOYMENT.md` | Hosting options compared, step-by-step deploy, production checklist |
| `docs/PLAN.md` | Task breakdown for the hardening iteration |
| `README.md` | Local setup, run instructions, review script, deploy steps |
| `ARCHITECTURE.md` | Architecture note: priorities, access model, trade-offs |
| `AI_WORKFLOW.md` | AI workflow note |
| `docs/DECISIONS.md` | Decision log: every tech choice with options, evidence, accept/reject reasons |
| `docs/SDLC.md` | Process record: phases, who/when/what/why, defect log |
| `SUBMISSION.md` | This file |
| `VIDEO_URL.txt` | Walkthrough video link |
| `vercel.json`, `server/vercel.js`, `scripts/build-vercel.mjs` | Live deployment (Vercel + Neon) |
| `Dockerfile`, `render.yaml` | Alternative deployment configs |
| `screenshots/` | Sign-in, owner editing, share dialog, viewer read-only, dark mode, mobile, version history, presence |

## Status
**Working end to end:**
- Create, rename and edit documents with rich text: H1–H3, bold, italic, underline, strikethrough, bulleted and numbered lists, quote, undo/redo.
- Autosave; reopen after refresh with formatting intact.
- Import .txt, .md or .docx as a new document.
- Share as editor or viewer; owned and shared lists are separate.
- View-only access enforced in both the UI and the API; delete and sharing are owner-only.
- Export to Markdown.

**Stretch items built:**
- **Version history:** browse, preview and restore earlier versions.
- **Collaboration indicators:** who else is in the document, plus a notice when someone else changes it.
- **Export to PDF.**
- **Roles beyond basic access:** owner/editor/viewer with in-place role changes.

**Intentionally not built:** real auth, simultaneous co-editing, comments/suggestion mode, attachments. Reasons are in `ARCHITECTURE.md` and the README's Scope section.

**Next 2–4 hours:** conflict detection on save (409), anchored comments, magic-link auth, presence on Redis/WebSockets.

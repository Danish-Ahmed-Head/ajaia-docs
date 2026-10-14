# Testing guide

## One command
```bash
npm run check      # ESLint + 38 API tests + production build
npm run test:e2e   # 14 browser tests (Playwright, real Chrome, 3 users, in-memory DB)
```
Last run: 2026-10-14 12:50 PKT. `check` clean, 30/38 API tests, 14/14 E2E. Live site (https://ajaia-docs-three-pi.vercel.app): 21/21 smoke checks (roles, sanitising, sharing, versions, presence, import, security headers).

## What is covered

| Layer | File | What it proves |
|---|---|---|
| API | `test/api.test.js` (7) | create, rename, edit, reopen; formatting kept; `<script>` and `onerror` stripped; validation (empty/long title, wrong types, 1 MB cap); 401/404/400 shapes; delete cascades |
| API | `test/sharing.test.js` (4) | owner sees share list, others don't; re-share changes role; self/unknown/invalid role rejected; unshare revokes at once |
| API | `test/security.test.js` (5) | forged/tampered/unsigned session cookies rejected; cookie flags; CSP and security headers; non-JSON bodies refused (415); login rate limit (429) |
| API | `test/versions.test.js` (5) | version grouping per author/session; restore (recorded as a version); viewer can't restore; stranger 403; another document's version id = 404; presence (members see each other, leave, strangers refused) |
| API | `test/convert.test.js` (5) | .txt escaping, Markdown subset, real generated .docx, unsupported types (415), corrupt .docx (422) |
| E2E | `e2e/app.spec.js` (10) | full owner flow with reload; share → editor edits → viewer read-only; direct API write as viewer = 403; Markdown import; export Markdown and PDF (print layout checked); version history restore across two users; two-browser presence and update notice; keyboard-only incl. Markdown shortcuts; no keystroke lands in the previous doc while a new one loads; expired session. Single-browser tests also fail on any console error |

## Mutation check (do the tests actually catch bugs?)
Four deliberate bugs were injected into the server one at a time; the suite failed each time, then was restored:

| Injected bug | Result |
|---|---|
| Viewers allowed to edit | 2 tests failed |
| Non-owners allowed to share | 1 failed |
| HTML sanitising removed | 1 failed |
| Session signature check removed | 1 failed |

## Manual test script (≈10 minutes, for a reviewer)
Accounts: `alice@example.com` (owner), `bob@example.com` (editor), `carol@example.com` (viewer). No passwords.

| # | Steps | Expected |
|---|---|---|
| 1 | Sign in as Alice → **+ New document** | New doc opens; title is selected |
| 2 | Rename it; type text; set Heading 1; apply bold, italic, underline; make a bullet and a numbered list | Formatting shows; status goes "Unsaved…" → "All changes saved" |
| 3 | Refresh the page | Same content and formatting |
| 4 | Ctrl+Z / Ctrl+Y | Undo and redo work; undo never reaches into another doc |
| 5 | Share → Bob "Can edit", Carol "Can view" | Both appear in "People with access" |
| 6 | Switch user → Bob | Doc in **Shared with me** with "can edit"; editing saves; no Share/Delete buttons |
| 7 | Switch user → Carol | Banner "view-only", toolbar disabled, title read-only |
| 8 | As Alice, remove Carol; switch to Carol | Doc is gone from her list; opening its URL shows an error toast |
| 9 | Import a `.docx`, a `.md` and a `.txt` | Each becomes a new doc you own |
| 10 | Import a `.pdf` | Toast "Unsupported file…" |
| 11 | Export .md | File downloads with the same content |
| 12 | Delete a shared doc as owner | Disappears for Bob as well |
| 13 | Kill the network (DevTools → Offline) and type | Status "Not saved: Network error"; reconnect → it retries and saves |
| 14 | Tab through the sign-in screen and the toolbar | Visible focus; everything reachable by keyboard |

## Security checks a reviewer can run
```bash
# Unauthenticated → 401
curl -i http://localhost:3000/api/docs
# Headers: CSP, nosniff, frame protection, no X-Powered-By
curl -I http://localhost:3000/
# Non-JSON write → 415
curl -i -X POST http://localhost:3000/api/login -H "content-type: text/plain" -d "email=alice@example.com"
```

## Known gaps (stated, not hidden)
- No load/performance testing; the free tier is for demos.
- E2E runs in Chrome only.
- No automated accessibility scan (axe); keyboard flow is tested by hand and in one E2E.
- Real-time collaboration is not built, so it's not tested.

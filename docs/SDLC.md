# SDLC record

**Model chosen:** a time-boxed **iterative / incremental** lifecycle: Agile-style short iterations, each ending in a working, tested build.
**Why this model:** The brief is ambiguous, the timebox is hard (4 h), and the reviewers grade prioritisation. Waterfall would spend the budget on upfront design before anything runs. Pure Scrum ceremonies (sprints, standups) don't fit a solo 4-hour job. Iterating means there is always a submittable build, and each iteration is driven by evidence (tests, browser checks, official docs).
**Rejected:** Waterfall (no working software until the end, high risk under a timebox). V-model (too much test-planning overhead for the scope). Spiral (risk analysis is valuable, so it's kept, but as a lightweight ADR log rather than formal cycles).

**Roles:** *Danish Ahmed*: product owner, decision approver, reviewer, submitter. *Claude Code (Opus 5.5)*: AI pair: research, implementation, test execution, documentation drafts.
**Dates/times:** 2026-10-14, PKT (UTC+5).

| Phase | When | Who | What was produced | Why / exit criterion |
|---|---|---|---|---|
| 1. Requirements analysis | ~10:58 | Claude drafted, Danish reviewed | Brief read line by line into R1–R8 (see `DECISIONS.md`) | Every requirement maps to a feature, a doc or an explicit cut |
| 2. Iteration 1: walking skeleton | 11:00–11:12 | Claude built, Danish observed | Express + SQLite + `contenteditable` app; 3 API tests; browser-verified flows | Prove the full slice (create → share → view-only) works before polishing |
| 3. Research and design review | 11:15–11:20 | Danish requested; Claude researched | `DECISIONS.md` ADR-001 to 007, built from the npm registry and official docs (Node, Tiptap, Express, multer, Render, Neon, PGlite) plus community comparisons | Found 3 defects in iteration 1: CVE-affected multer 1.x, deprecated editor API producing invalid HTML, and storage that wouldn't survive Render's free tier |
| 4. Iteration 2: implementation | 11:20–11:25 | Claude | Express 5.3, multer 2.4, Postgres (`pg` 8.23 for Neon, PGlite 0.5.9 for dev/test), Tiptap 3.32 via Vite 8.3; Dockerfile and `render.yaml` | All versions pinned to npm `latest` stable on 2026-10-14 |
| 5. Testing | 11:21–11:26 | Claude ran; results shown to Danish | `npm test`: 5/5 pass. Browser E2E as Alice, Bob and Carol. Real `.docx` import checked | Caught and fixed 2 bugs in v2: PGlite not creating its parent folder on a fresh clone, and a toolbar TDZ error that blocked Enter |
| 6. Deployment | 12:14–12:41 | Danish (account owner, approved each push); Claude guided and fixed | GitHub repo → Vercel Hobby + Neon (Render dropped at 12:20: card check, ADR-004). Live at https://ajaia-docs-three-pi.vercel.app | Live smoke test 21/21 against the real Neon database |
| 6b. Independent review and UX iterations | 12:41–13:39 | Two reviewer agents, then Claude fixed; Danish approved | 16 review fixes (D9–D24), UX fixes and a UI/UX Pro Max audit (D25–D27) | Every fix has a regression test; check and E2E green |
| 6c. IEEE documentation set | 13:39 onward | Claude drafted with three parallel agents; Danish reviews | `docs/ieee/`: SPMP, SRS with use cases, SDD, test documentation, process diagrams and mind map | Each phase documented after its standard |
| 7. Documentation and handover | 11:26 onward | Claude drafted; Danish to edit | README, ARCHITECTURE, AI_WORKFLOW, SUBMISSION, this file, screenshots | Reviewer can evaluate in under 5 minutes |
| 8. Maintenance (out of timebox) | n/a | n/a | "Next 2–4 hours" list in `ARCHITECTURE.md` | Shows the forward plan without over-building |

## Quality gates applied at every iteration
1. `npm test` green.
2. `npm run build` clean.
3. Browser check of the main flow, with the console checked for errors.
4. No secrets in the repo (`DATABASE_URL` lives only in the Render dashboard; `.env` is gitignored).

## Defect log
| ID | Found | By | Defect | Fix | Verified |
|---|---|---|---|---|---|
| D1 | 11:01 | Claude (tool output) | Bash heredoc silently wrote no files | Switched to direct file writes | Files listed |
| D2 | 11:05 | `npm test` | `node --test test/` fails on Windows | Explicit `test/*.test.js` glob | 3/3 pass |
| D3 | 11:09 | Browser check | Editor nested `<ul>` inside `<p>` (invalid HTML) | Replaced the editor engine with Tiptap (ADR-001) | Saved HTML is `<ul><li><p>…` |
| D4 | 11:16 | Official docs | multer 1.4.5-lts: 13 CVEs fixed in 2.x | Upgraded to 2.4.0 | `npm ls` |
| D5 | 11:16 | Official docs | Render free storage is ephemeral, so data would be lost | Moved to Neon Postgres (ADR-003) | Pending deploy |
| D6 | 11:20 | Server start | PGlite fails if `data/` doesn't exist (fresh clone) | `mkdirSync(..., {recursive:true})` | Server boots on a clean checkout |
| D7 | 11:21 | Browser console | `ReferenceError` in toolbar state (TDZ: `{ level }` inside its own initialiser) blocked every transaction, including Enter | `{ level: l }` | Enter, heading and lists verified; console clean on the new bundle |
| D8 | 12:35 | Vercel production logs (read in Chrome) | Every API call 500: Vercel's function loader can't require() ESM-only htmlparser2 v12 from CommonJS sanitize-html; worked locally on Node 24. Downgrading sanitize-html would reintroduce two published XSS advisories (GHSA-g8qq-57p8-ggw5, GHSA-jxwj-j7wr-gfrw); forcing htmlparser2 v10 changes parsing that those fixes rely on | Bundle the API into one self-contained ES module with esbuild and deploy via Vercel Build Output API v3 | Test loads the bundle from a folder with no node_modules; 30/30 tests |
| D9 | 13:00 | Independent server review | pg pool had no error listener: Neon closing an idle connection would crash the process | pool.on("error") + idleTimeoutMillis 10 s | review-fixes test: unreachable DB fails cleanly |
| D10 | 13:00 | Server review | Out-of-range/non-numeric ids (e.g. 2147483648, "abc" on unshare) caused Postgres errors → 500 | toId() validation → 404 | review-fixes test |
| D11 | 13:00 | Server review | .docx zip bomb: 2 MB upload could inflate to GBs in memory | Read zip central directory first; refuse > 20 MB expanded (413) | review-fixes test with a real 21 MB-expanding .docx |
| D12 | 13:00 | Server review | Alternating authors grew version history without bound | Cap at 100 stored versions per document | review-fixes test: 106 alternating saves → 100 |
| D13 | 13:00 | Server review | Stored links could keep rel="opener" (reverse tabnabbing) | sanitize-html transformTags forces rel="noopener noreferrer nofollow" | review-fixes test |
| D14 | 13:00 | Server review | Malformed multipart upload → 500 | Busboy errors without status mapped to 400 | review-fixes test |
| D15 | 13:00 | Server review | Production could silently run on the throwaway local DB if DATABASE_URL was missing | Refuse to start in production without it | review-fixes test |
| D16 | 13:00 | Server review | Document update and version insert not atomic | db.tx() transaction for save, restore and import | All API tests |
| D17 | 13:00 | Server review | Cold start: 10 DB round trips and a CREATE TABLE race between instances | Schema in one statement batch under pg_advisory_xact_lock; seed in one INSERT | review-fixes test: restart on same DB |
| D18 | 13:00 | Independent frontend review | Escape in the delete dialog could delete the document (dialog kept returnValue "confirm") | Reset returnValue before opening | E2E regression test |
| D19 | 13:00 | Frontend review | After Switch user (no reload) the next person could see/edit the previous person's open doc | closeDocView() on logout and session expiry | E2E regression test |
| D20 | 13:00 | Frontend review | Races: fast doc switching, history preview vs restore target, failed-save state leaking into next doc, presence stopped when staying | openSeq guard, selected-version guard, reset dirty/timer after leaving, stopPresence after the leave check | Existing E2E + code trace |
| D21 | 13:00 | Frontend review | Owner downgrades an editor mid-session: editor stayed editable, saves failed forever | 403/404 on save or presence → reload the doc with the new role | E2E regression test |
| D22 | 13:00 | Frontend review | Markdown export broke nested lists and "**Ship **it" marks; hard breaks lost | Indented list items, marks hug words, br → two-space break | E2E regression test |
| D23 | 13:00 | Frontend review | Closed mobile drawer stayed in Tab order; arrow keys on Text style jumped out of the select | Drawer inert when closed; focus returns only on pointer pick or Enter/Escape | Manual + E2E (keyboard flow) |
| D24 | 13:00 | E2E run | Autosave re-fetched the whole document list every save (~2 req/s typing) → tripped the 300/min limit | Refresh list only when title changes or every 30 s; global limit 600/min | 14/14 E2E twice |
| D25 | 13:15 | UX pass (phone screenshot) | On phones with no document open, the top bar stretched to ~40% of the screen (grid had no explicit rows, so min-height's spare space was shared out) | `grid-template-rows: auto 1fr` on phones; added "Your documents" button since phones have no visible sidebar | E2E (phone top bar < 70 px, menu opens) |
| D26 | 13:15 | UX pass | Ctrl+S opened the browser's "Save page" dialog; import only via file picker | Ctrl/Cmd+S saves now (or confirms autosave); drop a file anywhere to import, with a drop overlay | E2E (drop import, Ctrl+S) |
| D27 | 13:35 | UI/UX Pro Max audit (scripted: tap size, contrast, focus; light + dark) | On touch screens toolbar and action buttons were 34–38 px (guideline: 44 px). Contrast and focus rings passed | `@media (pointer: coarse)` raises targets to 44 px on touch only; drawer `overscroll-behavior: contain` | E2E (no control under 44 px on a touch phone) |
| D28 | 14:05 | Second independent server review | Import never checked converted size: a 1.2 MB .txt became a document over the 1M-character save limit, so every later save failed (413) forever | Import refuses converted content over the same limit (413), nothing created | review-fixes test |
| D29 | 14:05 | Server review | A save racing a delete hit a foreign-key error (500) after the row vanished | UPDATE returning no row → 404, transaction rolls back (save and restore) | Code trace (race can't be forced in a test) |
| D30 | 14:05 | Server review | Session cookie had no issue time, so a copied cookie never expired server-side | Cookie = userId.issuedAt.HMAC; server rejects > 7 days | security tests (tamper with time, 8-day-old cookie) |
| D31 | 14:05 | Server review | No DB timeouts: a waking or saturated Neon made requests hang until the platform killed them | pg Pool connectionTimeoutMillis 5 s, statement_timeout 10 s | All API tests |
| D32 | 14:05 | Server review | Every 10 s presence poll (and share/versions/delete) loaded the full document body (up to 1 MB) | loadDoc selects content only for GET and PUT; versions list shows all 100 stored; empty presence entries removed | All API tests |
| D33 | 14:05 | Second independent frontend review | A file dropped while the Delete or Share dialog was open imported and switched documents, so the dialog acted on the new one | Drops ignored while a dialog is open or signed out (still cancelled so the browser doesn't navigate) | E2E |
| D34 | 14:05 | Frontend review | Ctrl+Shift+S (strikethrough) triggered the save handler; non-Latin layouts missed Ctrl+S | Match `e.code === 'KeyS'` without Shift/Alt; E2E now proves the browser default is cancelled | E2E |
| D35 | 14:05 | Frontend review | Touch tablets in landscape squeezed labelled buttons to 44 px; Share dialog selects 36 px on touch; toolbar slid under the taller touch top bar; focus dropped to body when the drawer closed; drop tip shown on phones | Scoped widths, 44 px dialog selects, toolbar offset, focus returned to the menu button, tip hidden on touch | E2E (tablet labels, focus return) |

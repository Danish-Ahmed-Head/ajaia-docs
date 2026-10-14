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
| 6. Deployment | _pending_ | Danish (account owner); Claude guides | GitHub repo → Render (free) + Neon (free) | Needs Danish's accounts and explicit approval before anything is pushed |
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

# AI workflow note

## Tools used
- **Claude Code** (desktop app, agentic mode, Opus 5.5): planning, research, implementation, tests, docs.
- **Claude Code's built-in browser**: drove the running app as three different users to verify flows and read console errors.
- **Context7 docs server + web fetch**: read **current official docs** (Node, Tiptap, Express, multer, Render, Neon, PGlite) instead of relying on model memory.
- **npm registry** (`npm view`, `npm audit`): the source of truth for "latest stable" versions and known vulnerabilities.

## Where AI materially sped up the work
- Turned the brief into a requirement table (R1–R8) and a working end-to-end skeleton in about 15 minutes.
- Parallel research: version checks across 16 packages plus 8 official-doc pages in a few minutes, summarised into ADRs (`docs/DECISIONS.md`).
- Boilerplate (routes, schema, share dialog, CSS) and the API test suite.
- Drafting README, architecture, SDLC and submission docs from the actual code and session log.

## What I changed or rejected from AI output
| AI output | What I did | Why |
|---|---|---|
| First build used `contenteditable` + `execCommand` | **Replaced** with Tiptap 3 | Browser check showed invalid HTML (`<ul>` inside `<p>`); `execCommand` is deprecated |
| First build pinned multer 1.4.5-lts and Express 4 | **Upgraded** to multer 2.4 and Express 5 | Official multer releases list 13 CVEs fixed in 2.x; Express 5 is the current stable major |
| First build used SQLite on the app server | **Replaced** with Postgres (Neon) | Render's free tier docs: ephemeral filesystem, no disks. Reviewers would find an empty app later |
| Lexical, BlockNote, Next.js as options | **Rejected** | Lexical and BlockNote are pre-1.0; Next.js adds risk without product value at this scope |
| Toolbar state code | **Fixed a bug** the AI wrote (`{ level }` used inside its own initialiser) | Caught by reading the browser console; it blocked every edit, including Enter |
| `mammoth` audit warnings | **Accepted risk**, documented | The vulnerable chain (`argparse` → `sprintf-js`) is CLI-only and not reachable from the library API |

## How correctness and quality were verified
- **Automated:** `npm test` runs 5 API tests over real HTTP against in-memory Postgres:
  - roles: owner, editor, viewer, no access
  - owner-only delete and share
  - `<script>` stripped while formatting is kept
  - .txt/.md import, and 415 for an unsupported type
  - UTF-8 filenames preserved
  - 401, 404 and malformed JSON handled cleanly
  - delete cascades to shares
- **Manual E2E in a browser, per role:**
  - As Alice: typed with keyboard shortcuts, applied H1 and lists from the toolbar, watched autosave, then reloaded and confirmed the saved HTML.
  - Shared the doc; Bob saw "can edit". Carol saw a view-only banner and a disabled toolbar, and her direct API write returned 403.
- **Real file:** a real `.docx` imported into paragraphs, bold text and a link.
- **Console:** checked for errors after each build. That is how defect D7 was found.
- **Docs-first:** every library choice was checked against its official docs and the npm `latest` tag on 2026-10-14. The defect log is in `docs/SDLC.md`.

# Decision log (ADRs)

**Who:** Danish Ahmed is the decision owner and approves every row. Claude Code (Anthropic, Opus 5.5) is the AI assistant that researched options and proposed choices.
**When:** 2026-10-14, Asia/Karachi (UTC+5). Assessment timer started at about 10:55; hard stop at about 14:55.
**Method:** For each decision, list the realistic options and community sentiment first. The final choice rests only on **official sources**: vendor docs, the npm registry, and release notes. Versions are the npm `latest` dist-tag checked on 2026-10-14 at 11:15. Pre-release tags (`next`, `beta`, `nightly`) are excluded.

---

## Requirements read line by line → what drives the decisions

| # | Brief requirement | Implication |
|---|---|---|
| R1 | Create, rename, edit, save and reopen documents | CRUD API plus persistent storage |
| R2 | Bold, italic, underline, headings, lists; "usable and coherent" | A real editor engine, not just formatting commands |
| R3 | Upload ≥1 file into the workflow; state supported types in UI and README | Import .txt/.md/.docx as a new doc; limits shown in UI |
| R4 | Owner, grant access, owned vs shared visible; mocked users allowed | `shares` table, role checks on the server, seeded users |
| R5 | Persist docs and shares; survive refresh; formatting preserved | Durable DB; content stored as sanitised HTML |
| R6 | Setup docs, **live deployment reviewers can access**, validation, ≥1 test, architecture note | Hosting must keep data between reviewer visits |
| R7 | **"Do not require reviewers to pay"** | Free tiers only; no paid editor features |
| R8 | 4–6 h timebox; depth over breadth | Prefer simple stacks; scope cuts written down |

---

## ADR-001: Editor engine

| Option | Version (npm latest) | Evidence | Verdict |
|---|---|---|---|
| `contenteditable` + `document.execCommand` (v1 build) | built into the browser | `execCommand` is deprecated (MDN). Produced invalid HTML in testing (`<ul>` nested inside `<p>`) | **Rejected:** fragile, and was already producing bad markup |
| **Tiptap v3** (ProseMirror) | `@tiptap/core` 3.32.0 | Official docs: framework-agnostic vanilla JS setup. StarterKit v3 includes Bold, Italic, **Underline**, Strike, Heading, Bullet/Ordered lists, Link, Undo/Redo. Schema-enforced output. Most 2026 comparisons name it the default for docs and knowledge-base products | **Accepted** |
| Lexical | 0.52.0 | Pre-1.0. Lower-level, so more to build. Sources say it suits performance-heavy and mobile work | Rejected: 0.x release, more build time |
| Quill | 2.0.3 | Stable but last published January 2025. Sentiment calls its model and ecosystem legacy | Rejected: lowest momentum |
| BlockNote | 0.55.0 | Pre-1.0 and opinionated (block UI) | Rejected: 0.x release |

**Why Tiptap:** It is the only stable (≥1.0) and actively maintained option that covers R2 out of the box. Its schema guarantees well-formed HTML, and it is the standard upgrade path toward real-time collaboration (Yjs). All the features we use are MIT open source, so nothing is paid (R7).

## ADR-002: Application framework

| Option | Evidence | Verdict |
|---|---|---|
| **Express 5** + vanilla JS frontend bundled with Vite | `express` 5.3.0 is `latest`. Official migration guide: rejected promises are forwarded to error middleware, and Node ≥18 is required. `vite` 8.3.4 needs Node ≥22.12 | **Accepted** |
| Express 4 (v1 build) | Superseded; 5.x is `latest` | Rejected: not the current stable major |
| Next.js 16 + React 19 | `next` 16.4.0. Strong on my CV, but adds RSC/server-action complexity and a React layer the brief doesn't need | Rejected **for this timebox**. Product value is equal and delivery risk is higher. Noted as the production path |

**Why:** This is the smallest stack that still shows separate frontend, API, persistence and access logic. Express 5's async error handling removes the try/catch boilerplate the v1 build needed.

## ADR-003: Database and persistence

| Option | Evidence (official) | Verdict |
|---|---|---|
| SQLite on the app server (v1 build) | Render free docs: filesystem is **ephemeral**, lost on spin-down after **15 minutes** idle, and persistent disks are **not allowed** on free. Node docs: `node:sqlite` is **Stability 1.2, release candidate**, not stable | **Rejected:** a reviewer opening the link later would find an empty database, which fails R5/R6 |
| **Postgres on Neon (free)** via `pg` | Neon plans page: Free tier has 1 GB per project and 100 CU-hours per month; compute suspends after 5 minutes idle; exceeding limits never deletes data. `pg` 8.23.1 is stable | **Accepted** for production |
| Supabase free | Free projects pause after inactivity | Rejected: same "reviewer finds it dead" risk |
| Turso (libSQL) | Official intro page didn't state free-tier limits or client behaviour | Rejected: couldn't verify from official sources |
| **PGlite** (Postgres in WASM) for local dev and tests | `@electric-sql/pglite` 0.5.9. Official docs: in-memory with `new PGlite()`, file-backed with a path | **Accepted for dev/test only.** It is 0.x, so it is never used in production. The benefit is the same SQL dialect as production, with zero setup for reviewers running locally |

## ADR-004: Hosting

| Option | Evidence | Verdict |
|---|---|---|
| **Render free web service** | 750 instance-hours per month; spins down after 15 minutes idle with about a 1-minute cold start; deploys from GitHub; no card needed for the free service | **Accepted.** The cold start is documented in the README so reviewers aren't surprised |
| Railway | Trial credit only, not a permanent free tier | Rejected (R7) |
| Vercel | Serverless functions; fine, but Express + multipart uploads fit a long-running server better | Rejected for this shape of app |
| Fly.io | No free tier for new accounts | Rejected (R7) |

## ADR-005: Upload handling and security

| Item | Evidence | Decision |
|---|---|---|
| `multer` | v1 build used 1.4.5-lts.2. Official releases list **13 CVEs fixed in 2.0.0–2.4.0** | **Upgrade to 2.4.0** (latest stable) |
| `.docx` → HTML | `mammoth` 1.13.0. `npm audit`: 3 moderate findings via `argparse`→`sprintf-js`, which are used only by mammoth's **CLI**, not the library API we call | **Accepted risk.** The vulnerable path isn't reachable. Recorded here and in the README |
| Sanitising stored HTML | `sanitize-html` 2.18.0, allow-list on the server | Kept: the server is the trust boundary even with Tiptap's schema |

## ADR-006: Auth

Mocked auth (pick a seeded user; httpOnly cookie) is **accepted**, because the brief explicitly allows it (R4). Real auth (OAuth or magic link) is **rejected for the timebox** and listed under next steps.

## ADR-007: Testing

`node:test` (built in, stable) running real HTTP requests against the Express app, backed by in-memory PGlite. This covers role enforcement, sanitisation, upload and validation. A Playwright UI test is deferred and listed under next steps.

---

## Change log
| Time (PKT) | Who | What | Why |
|---|---|---|---|
| 11:00 | Claude, approved by Danish | v1 build: Express 4, SQLite, `contenteditable` | Fastest path to working end-to-end slice |
| 11:12 | Claude | v1 verified in browser, 3/3 tests passing | Baseline before research |
| 11:15 | Danish | Requested official-docs research, stable versions only, full SDLC docs | Raise quality and traceability |
| 11:17 | Claude, approved by Danish | ADR-001 to ADR-007 above; v2 = Tiptap 3, Express 5, Postgres (Neon) + PGlite, multer 2 | Evidence above: v1 had CVE-affected multer, deprecated editor API, and non-durable hosting storage |

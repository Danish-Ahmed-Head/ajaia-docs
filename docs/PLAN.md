# Work plan (iteration 3: hardening)

Owner: Danish Ahmed · AI pair: Claude Code (Opus 5.5) · Started 2026-10-14 11:35 PKT · Hard stop ~14:55 PKT

**Loop for every task:** build → read the diff → `npm run check` (lint + tests + build) → fix → repeat until clean → tick the box → next task.

**Version policy:** the newest stable release that has been public for **at least 7 days** (no `alpha`/`beta`/`next`). A release from yesterday hasn't had time for regressions to surface. Checked against the npm `time` field on 2026-10-14.

**Context that shapes priorities.** Ajaia works in regulated industries (healthcare, finance, government) and talks about governance, private deployments and security. The job ad asks for "secure, observable, maintainable" systems and a critical eye on AI output. So security and verification get depth; features stay scoped.

| # | Task | Done when |
|---|---|---|
| T1 | Re-pin dependencies to the 7-day policy (express 5.2.1, vite 8.3.3, tiptap 3.31.4, pglite 0.5.8) | Install clean; tests and build pass |
| T2 | Add ESLint 10 flat config + a `npm run check` script (lint + test + build) | 0 lint errors |
| T3a | Signed session cookie (HMAC-SHA256, `SESSION_SECRET`), `Secure` in production, `trust proxy` | Forged or tampered cookie → 401 (test) |
| T3b | Security headers via `helmet`, including a strict CSP for the built app | Headers present (test); app still loads (browser) |
| T3c | Rate limits: login, uploads, writes | 429 after the limit (test) |
| T3d | Mutating requests must be JSON or multipart (blocks form-encoded cross-site posts) | 415 for `text/plain` POST (test) |
| T4 | Unit tests for `convert.js` (.txt escaping, Markdown subset, .docx via generated fixture, unsupported type) | Tests pass |
| T5 | Sharing edge tests: change role, unshare, share with self or unknown, editor can't see the share list | Tests pass |
| T6 | Frontend resilience: 401 → back to sign-in; save failure keeps the edits and retries; no race when switching docs | Browser-verified |
| T7 | Playwright E2E: owner creates/formats/shares → editor edits → viewer blocked → import | `npm run test:e2e` green |
| T8 | Accessibility pass: labels, focus, keyboard-only flow | Keyboard-only run works |
| T9 | Docs: README, ARCHITECTURE, DECISIONS, SDLC, TESTING (manual test script), DEPLOYMENT (options) | Reviewed |
| T10 | Interview prep: company brief, likely questions, demo script | Written |
| T11 | Ask Danish: deployment option, accounts, push and publish approvals | Answers received |

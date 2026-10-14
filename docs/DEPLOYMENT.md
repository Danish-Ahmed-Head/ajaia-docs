# Deployment options

**Requirement from the brief:** "a working deployment reviewers can access"; "do not require reviewers to pay."
**Facts checked 2026-10-14 against official docs:** Render free web services sleep after 15 minutes idle (about a minute cold start), have an ephemeral filesystem, and allow no persistent disks. Neon free keeps 1 GB per project; its compute suspends after 5 minutes idle and data is not deleted at the limit.

| Option | Cost | Data survives? | Cold start | Effort | Fit |
|---|---|---|---|---|---|
| **A. Render (web) + Neon (Postgres)** | $0 | Yes (Neon) | about 1 min after 15 min idle | Low: `render.yaml` included | **Recommended.** Reviewer can open it any time; the data is real Postgres |
| B. Docker on a VPS you already have (Hetzner/Contabo + Coolify) | Your existing server cost | Yes | None | Medium; you already run this stack for Barakah Abaya | Best demo speed and shows DevOps skill, but ties up a server and needs a domain/TLS |
| C. Railway | Trial credit only | Yes | None while credit lasts | Low | Rejected: can lapse during review |
| D. Vercel | $0 | Needs external DB | Serverless | Medium: Express must be adapted | Rejected: wrong shape for long-lived Express + uploads |
| E. Fly.io | No free tier for new accounts | n/a | n/a | n/a | Rejected |

## Recommendation
**A for the submission**, because it costs nothing, survives restarts, and the README warns reviewers about the cold start. Keep **B** as the backup if reviewers want an always-warm URL: you already have the Coolify setup from Barakah Abaya.

## Option A, step by step
1. **Neon:** create a project → copy the connection string (`postgres://…?sslmode=require`).
2. **GitHub:** create a private or public repo and push this folder.
3. **Render:** New → Blueprint → select the repo (`render.yaml` is picked up).
4. Environment variables, entered in the dashboard only (never committed):
   - `DATABASE_URL` = the Neon string
   - `SESSION_SECRET` = 64 random hex characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `NODE_ENV` = `production`
5. Verify: open `/api/health` → `{"ok":true}`; sign in as Alice; create a doc; redeploy; confirm it persists.
6. Put the URL into `README.md` and `SUBMISSION.md`.

## Production checklist
- [ ] `SESSION_SECRET` set (the server refuses to boot in production without it)
- [ ] `DATABASE_URL` points at Neon, not local
- [ ] HTTPS only (Render provides it; cookies are `Secure` when `NODE_ENV=production`)
- [ ] Health check path `/api/health` configured
- [ ] No secrets in git (`git log -p | grep -i secret` is clean)
- [ ] Cold-start warning is in the README

## Known limits of the demo deployment
Mocked auth means anyone with the URL can sign in as any seeded user. That's acceptable for a review build, since the brief allows it, and must not be used for real data.

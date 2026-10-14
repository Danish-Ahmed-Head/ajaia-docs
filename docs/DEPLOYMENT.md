# Deployment options

**Requirement from the brief:** "a working deployment reviewers can access"; "do not require reviewers to pay."

**Facts checked 2026-10-14 against official docs and signup pages:**
- **Vercel Hobby** is free for personal projects; its signup page has no card field; Express runs as a single function.
- **Render free** sleeps after 15 minutes idle. It asked a Pakistan signup for card verification, which Render staff describe as an anti-abuse check with no alternative.
- **Neon free** gives 1 GB per project; compute suspends after 5 minutes idle; data is never deleted at the limit.
- **Hugging Face Docker Spaces** now need a paid plan. **Koyeb** needs a card.

| Option | Cost | Card? | Data survives? | Effort | Verdict |
|---|---|---|---|---|---|
| **A. Vercel (app) + Neon (Postgres)** | $0 | No | Yes (Neon) | Low: `vercel.json` + `scripts/build-vercel.mjs` included | **Live deployment.** No card, fast CDN for the pages, functions in Portland next to Neon (Oregon) |
| B. Render (web) + Neon | $0 | Asked for one | Yes | Low: `render.yaml` included | Good if you have a card that passes verification; about a 1-minute cold start after 15 min idle |
| C. Docker on your own VPS (Coolify/Caddy) | Your server cost | n/a | Yes | Medium: `Dockerfile` included | Always warm; needs your own server and a domain. Don't use a client's server |
| D. Hugging Face Docker Space | Paid plan required | — | — | — | Rejected |
| E. Koyeb / Railway / Fly.io | Card or trial only | Yes | — | — | Rejected |

## Option A: Vercel + Neon, step by step
1. **Neon** (https://console.neon.tech): create a project in **AWS US West 2 (Oregon)**, then **Connect** → copy the **pooled** connection string. Never commit it.
2. **Vercel** (https://vercel.com/signup → Continue with GitHub), then **Add New → Project** (https://vercel.com/new) → import `Danish-Ahmed-Head/ajaia-docs`.
3. On the configure screen, leave Framework, Build and Output as they are (`vercel.json` sets them). Open **Environment Variables** and add:
   - `DATABASE_URL`: the Neon string
   - `SESSION_SECRET`: generate locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the output
4. **Deploy**. When it's done, open `https://<your-app>.vercel.app/api/health`. It must show `{"ok":true,"db":"postgres"}`. If it shows `"db":"pglite"`, `DATABASE_URL` is missing; add it and redeploy.
5. Sign in as Alice, create a document, refresh. It should persist.
6. Put the URL into `README.md` and `SUBMISSION.md`.

## Option B: Render
Open https://render.com/deploy?repo=https://github.com/Danish-Ahmed-Head/ajaia-docs. The Blueprint (`render.yaml`) generates `SESSION_SECRET`; paste `DATABASE_URL` from Neon.

## Production checklist
- [ ] `SESSION_SECRET` set (the server refuses to start in production without it)
- [ ] `/api/health` reports `"db":"postgres"`, not `"pglite"`
- [ ] HTTPS only (both Vercel and Render provide it; cookies are `Secure` in production)
- [ ] Security headers present on pages and API (`curl -I https://<app>/` shows `content-security-policy`)
- [ ] No secrets in git

## Known limits of the demo deployment
- Mocked sign-in means anyone with the URL can act as a demo user. That's acceptable for a review build, since the brief allows it; don't use it for real data.
- On Vercel, presence and rate limits are held in memory per function instance, so they are best-effort. Redis (Upstash) would make them exact.

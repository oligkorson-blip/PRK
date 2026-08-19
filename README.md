# Parkwise

Consumer investor platform for **professionally managed parking assets** in selected European cities — with the potential for recurring monthly income. Parking-primary hubs may also include EV charging and related contracted streams.

> Not a live investment offering. Target returns, occupancy, and income mixes are illustrative. Operator names are catalogue context only and do not imply partnership or endorsement. Capital at risk. Monthly income and returns are not guaranteed.

## Canonical app

Everything product-facing lives in **`apps/web`** (Next.js 15, Better Auth, Postgres, Drizzle, local document vault).

| Doc | Purpose |
|---|---|
| [apps/web/docs/SETUP.md](apps/web/docs/SETUP.md) | Local + Docker setup, env vars, migrate/seed, optional SMTP |
| [apps/web/docs/PRODUCTION_CHECKLIST.md](apps/web/docs/PRODUCTION_CHECKLIST.md) | Gates before `DEMO_MODE=false` |
| [apps/web/docs/DEPLOY_NJALLA_COOLIFY.md](apps/web/docs/DEPLOY_NJALLA_COOLIFY.md) | One-VPS deploy |
| [docs/superpowers/plans/2026-07-19-parkwise-consumer-platform.md](docs/superpowers/plans/2026-07-19-parkwise-consumer-platform.md) | Consumer platform redesign plan (complete) |
| [apps/web/docs/plan-mobility-assets-verify.md](apps/web/docs/plan-mobility-assets-verify.md) | Mobility catalogue verify |

**Stack (current):** Better Auth (email/password) · Postgres · Drizzle · filesystem documents · optional SMTP (nodemailer) · Docker Compose.  
**Not used:** Clerk, Neon, Cloudflare R2, Resend, Vercel (optional later).

## Quick start

```bash
cd apps/web
nvm use                       # reads the repository's pinned Node 22 version
cp .env.example .env.local   # set BETTER_AUTH_SECRET, SUPER_ADMIN_EMAILS, DATABASE_URL
npm install --legacy-peer-deps
npm run db:migrate
npm run db:seed              # demo catalogue (≥24 hubs); wipes interests/holdings for removed slugs
ALLOW_BOOTSTRAP_SIGNUP=true npm run dev   # one-time: lets SUPER_ADMIN_EMAILS register at /sign-up
# open http://localhost:3000 — register the ops account, then restart WITHOUT the flag
```

Register the `SUPER_ADMIN_EMAILS` account at `/sign-up` **before** exposing the app on a shared URL: set `ALLOW_BOOTSTRAP_SIGNUP=true`, register, then **unset it** and restart (see SETUP). Signup is closed by default — `SIGNUPS_DISABLED` is legacy and ignored by the code, so do not rely on it.

Docker (local viewing — preferred):

```bash
cd apps/web
npm run docker:local          # Postgres + next dev (no production build)
# open http://localhost:3000
```

Production-style Compose image (slower):

```bash
cd apps/web
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
export SUPER_ADMIN_EMAILS="ops@example.com"
export BETTER_AUTH_URL="http://localhost:3000"
export NEXT_PUBLIC_APP_URL="http://localhost:3000"
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"   # required — no default in the production compose file
docker compose up -d --build
docker compose exec web npm run db:migrate
docker compose exec web npm run db:seed
```

## Legacy static HTML

An older static demo used to live at the repo root (`*.html`, `css/`, `js/`).
It was removed after the move to `apps/web`; see git history if ever needed.
Do **not** serve it on the production domain.

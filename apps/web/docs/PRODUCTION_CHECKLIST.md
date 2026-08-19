# Parkwise production launch checklist

Complete before setting `DEMO_MODE=false` on a public Njalla/Coolify domain.

Launch stack: **one VPS** (Njalla) + **Coolify** + Docker Compose (`web` + Postgres + documents volume). Do **not** require Vercel, Clerk, Neon, R2, or Resend.

## Legal and product

- [ ] Counsel has reviewed Terms, Privacy, and Risk Disclosure (replace draft copy)
- [ ] All yield / income surfaces say target or illustrative figures are not guaranteed; capital-at-risk language present near CTAs
- [ ] Marketing does not claim regulator approval or risk-free returns
- [ ] Static demo routes (`portal.html`, `register.html`, `dashboard.html`) are **not** served on the production domain
- [ ] `DEMO_MODE=false` only after legal sign-off (keep `true` on staging/demo)
- [ ] `npm run check:go-live` passes (no `scripts/seed-data.json` slugs left in `assets`) before flipping `DEMO_MODE=false` — the seeded catalogue marketed as real investments is an unlawful public financial promotion

## Infrastructure (Njalla + Coolify)

- [ ] Njalla domain + VPS (≥2 GB RAM; prefer 4 GB) paid in crypto
- [ ] Coolify installed; app reachable on the public domain
- [ ] Coolify HTTPS / Let’s Encrypt certificate active
- [ ] DNS A record points at the VPS
- [ ] Deployed via `apps/web/docker-compose.yml` (`web` + `postgres`)
- [ ] Production env set: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `SUPER_ADMIN_EMAILS`, `DEMO_MODE` (`ADMIN_EMAILS` deprecated); compose builds `DATABASE_URL` from `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
- [ ] `POSTGRES_PASSWORD` set to a strong unique value (and `POSTGRES_USER` / `POSTGRES_DB` too if changed from the `parkwise` defaults) — never run production with the default credentials
- [ ] Postgres port is bound to localhost only by default (`127.0.0.1:${POSTGRES_PORT:-5432}:5432`); do not publish it on a public interface
- [ ] `BETTER_AUTH_SECRET` is set before deploy — `docker compose` now fails fast with an error if it is missing (no empty/default secret fallback)
- [ ] `DEMO_MODE` set explicitly via env (compose default is `true`; set `false` only after legal sign-off)
- [ ] Document vault volume is private (`DOCUMENTS_DIR` / Docker volume — not publicly web-served except via authenticated download)
- [ ] `DOCUMENTS_ENCRYPTION_KEY` set (`openssl rand -hex 32`) **before any real KYC upload** — production startup fails with `DEMO_MODE=false` while it is missing or malformed; losing the key makes encrypted documents unrecoverable, so store it with the same care as `BETTER_AUTH_SECRET`
- [ ] Existing plaintext vault encrypted after setting the key (run before exposing real KYC documents): `npx tsx scripts/encrypt-documents.ts --dry-run`, then `npx tsx scripts/encrypt-documents.ts` (idempotent; already-encrypted files are skipped)
- [ ] Postgres volume backups and documents volume copies scheduled (see `scripts/backup.sh` and `DEPLOY_NJALLA_COOLIFY.md`)
- [ ] Resend not used — transactional email via optional SMTP (`SMTP_HOST`); without it, skip-logs (and **error logs** when `DEMO_MODE=false`); admin interest queue remains source of truth for ops

**Optional phase-2 (not required for launch):** self-hosted Gitea on the same VPS if GitHub must be avoided entirely.

## Data and access

- [ ] Migrations applied on production (`docker compose exec web npm run db:migrate` or `npx drizzle-kit migrate`)
- [ ] Catalogue seeded or imported (`npm run db:seed` or controlled import) — expect **≥ 24** assets from current `scripts/seed-data.json`
- [ ] At least one super-admin email listed in `SUPER_ADMIN_EMAILS`
- [ ] Super admin can sign up / sign in with that email and open `/admin` (`staff_profiles` upserted). Bootstrap signup (`ALLOW_BOOTSTRAP_SIGNUP=true`) accepts **only** emails in `SUPER_ADMIN_EMAILS`.
- [ ] After bootstrap on a shared URL, **unset `ALLOW_BOOTSTRAP_SIGNUP`** and restart so `/sign-up` redirects to `/apply` (apply-first). Do not leave bootstrap signup enabled publicly.
- [ ] Ops agents Phase 1 checks in `docs/plan-ops-phase1-verify.md` (promote agent, assign investor, scoped views)

## One-time maintenance

- Migration 0016 (indexes/constraints) and 0017 (leads `(list_id, lower(email))` unique index, drops the deprecated `investors.last_invite_url` column) require the usual `npm run db:migrate` after pull. If `leads` already contains duplicate `(list_id, lower(email))` rows, dedupe them before migrating or the 0017 index creation will fail.
- The image now runs as `USER node` (see `Dockerfile`), but existing `documents_data` volumes / bind mounts (`/data/documents`) may still contain root-owned files from previous root-run containers — document uploads would fail with EACCES. Re-own the volume once **before** starting the updated stack: `docker compose run --rm --user root web chown -R node:node /data/documents`

## Smoke test (production or staging twin)

- [ ] Sign up is closed publicly — investors use `/apply` (not open `/sign-up`)
- [ ] Public host submits `/list-a-space` → a new lead appears in the `Community space hosts` queue without publishing an exact address
- [ ] Admin confirms interest → holding visible with income summary
- [ ] Admin uploads a PDF → investor can download from vault
- [ ] Non-staff cannot access `/admin`
- [ ] Suspended / incomplete onboarding cannot express interest
- [ ] Demo banner absent only when `DEMO_MODE=false` intentionally

## Known follow-ups (acceptable post-MVP)

- [ ] Optional SMTP for transactional emails (`SMTP_HOST` + related vars; see SETUP.md)
- [ ] Optional Gitea (phase-2) for fully self-hosted git
- [ ] Versioned edits and approval workflow for already-published opportunities
- [ ] Automate host availability, bookings, recurring access, and payouts only after the manual community-space model is validated

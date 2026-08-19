# Parkwise web app — setup instructions

How to run the investor platform locally or with Docker (Better Auth, Postgres, filesystem documents).

**Production hosting:** one Njalla VPS + Coolify — see `docs/DEPLOY_NJALLA_COOLIFY.md` and `docs/PRODUCTION_CHECKLIST.md`.

**Not used at launch:** Clerk, Neon, Cloudflare R2, Resend, Vercel. Transactional email uses optional SMTP (`SMTP_HOST` + related vars); without them, sends skip-log. **Gitea** on the same VPS is an optional phase-2 git host (not required for v1).

## Lead ownership model (IB tier)

Staff roles: `super_admin`, `ib` (introducing broker), `agent`. Every agent belongs to
exactly one IB (`staff_profiles.ib_id`). Leads carry a **parent IB** separate from the
**assigned agent** — a lead never has an agent without a parent IB (DB check constraint).

- **Assign to IB** — super admin sends the lead to the IB's unassigned queue.
- **Assign to agent** — super admin (any agent) or IB (own team only); the lead
  automatically inherits the agent's parent IB.
- Every assignment/reassignment is written to `lead_assignments` (activity log) and
  `audit_events`. Notes, calls, and documents survive reassignment.
- Deactivating an agent requires a lead strategy (return to IB queue / reassign /
  unassign). Deactivation is a soft delete (`deactivated_at`) so history stays intact.
- Converted investors keep current IB/agent plus immutable `original_*` attribution.

**Upgrading an existing deployment:** run `npm run db:migrate` (adds the IB schema),
then `npm run db:ib-backfill` once (idempotent — creates a placeholder IB for existing
agents and links existing leads/investors to it). Reassign teams to real IBs afterwards.
See `docs/lead-assignment-model.md` for the full spec.

## Prerequisites

- Node.js 22+ (recommended: nvm)
- Postgres 15+ (local install, Docker Compose, or Coolify stack)
- Writable path for `DOCUMENTS_DIR` (document vault)

## 1. Install dependencies

```bash
cd apps/web
npm install
```

## 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `apps/web/.env.local` (never commit this file):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres URL, e.g. `postgresql://parkwise:parkwise@localhost:5432/parkwise` |
| `DOCUMENTS_DIR` | Yes | Local vault root, e.g. `./.data/documents` |
| `DOCUMENTS_ENCRYPTION_KEY` | Cond. | 32-byte key, hex or base64 (`openssl rand -hex 32`) — AES-256-GCM encryption at rest for the vault. Required when `DEMO_MODE=false`; see "Document encryption at rest" below |
| `DEMO_MODE` | Yes | `true` for local/demo/staging; `false` only after legal sign-off |
| `SIGNUPS_DISABLED` | No | Legacy; Better Auth signup is closed by default (apply-first). Prefer `ALLOW_BOOTSTRAP_SIGNUP` for first admin. |
| `ALLOW_BOOTSTRAP_SIGNUP` | No | Set `true` **once** so `/sign-up` works for emails in `SUPER_ADMIN_EMAILS` only, then unset |
| `CONFIRM_SEED` | Cond. | Required as `1`/`true` when running `db:seed` with `DEMO_MODE=false` (seed can wipe interests/holdings) |
| `BUYBACK_FUNDED` | No | Set `true` only when a funded buyback mechanism exists — otherwise `buyback_at_par` is rejected in validators and hidden in UI (CRO R3) |
| `SUPER_ADMIN_EMAILS` | Yes | Comma-separated super-admin emails (bootstrap ops owners) |
| `ADMIN_EMAILS` | No | **Deprecated** — fallback only if `SUPER_ADMIN_EMAILS` is unset |
| `BETTER_AUTH_SECRET` | Yes | Long random secret (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Yes | App origin, e.g. `http://localhost:3000` |
| `AUTH_RATE_LIMIT` | No | Sign-in / 2FA rate limits are on unless this is `false` or `0`. E2E CI sets `false` because Playwright shares one loopback IP |
| `NEXT_PUBLIC_APP_URL` | Yes | Same origin as `BETTER_AUTH_URL` |
| `IP_ENRICHMENT_API_URL` | No | Template with `{ip}`, e.g. `https://api.example.com/{ip}` |
| `IP_ENRICHMENT_API_KEY` | No | Bearer token when required by provider |
| `IP_ENRICHMENT_MMDB_PATH` | No | Absolute path to MaxMind-style city DB on server |
| `SMTP_HOST` | No | When set, enables transactional email via nodemailer |
| `SMTP_PORT` | No | Default `587` |
| `SMTP_SECURE` | No | `true`/`false`; defaults to secure when port is `465` |
| `SMTP_USER` / `SMTP_PASS` | No | Auth for the SMTP relay (omit only if relay allows unauthenticated) |
| `SMTP_FROM` | No | From header; falls back to `SMTP_USER` then `Parkwise <noreply@localhost>` |
| `OPS_INBOX_EMAIL` | No | Ops inbox notified on each new interest (delivered via SMTP when configured) |
| `FOUR_EYES_THRESHOLD_EUR` | No | Integer euros; interests at/above this amount need two distinct super admin approvals before confirm→holding (first approval audited as `interest.confirm_first_approval`). Defaults to `50000` when unset/invalid |
| `CONTRACT_LEGAL_SIGNER_EMAIL` | No | Counter-signer email used when creating agreements from confirmed interests. Falls back to the first `SUPER_ADMIN_EMAILS` entry |
| `CONTRACT_LEGAL_SIGNER_NAME` | No | Display name for the legal signer (default `Park legal signer`) |

### Optional SMTP (transactional email)

Without `SMTP_HOST`, `sendTransactionalEmail` logs `[email:skip]` (or `[email:skip:production]` when `DEMO_MODE=false`) and returns `{ sent: false, skipped: true }` — invite/interest/distribution flows still succeed; ops must deliver invite links manually (see runbook below).

With SMTP configured, successful sends log `[email:sent]` and return `{ sent: true }`. Failures log `[email:fail]` and return `{ sent: false }` without throwing (so admin actions are not rolled back by mail outages).

### Document encryption at rest (KYC)

When `DOCUMENTS_ENCRYPTION_KEY` is set, every new upload to the document vault is encrypted with AES-256-GCM (stored as `PWENC1` magic + IV + auth tag + ciphertext). Downloads decrypt transparently and legacy plaintext files stay readable — no code changes are needed in the upload/download flows.

1. Generate a 32-byte key and set it in `.env.local` (never commit it): `openssl rand -hex 32`
2. First run on an existing vault — encrypt the files already stored as plaintext:
   ```bash
   npx tsx scripts/encrypt-documents.ts --dry-run   # list what would be encrypted
   npx tsx scripts/encrypt-documents.ts             # encrypt in place (idempotent; PWENC1 files are skipped)
   ```
3. Back up the key with the same care as `BETTER_AUTH_SECRET`: losing it makes encrypted documents unrecoverable, and changing it strands files encrypted with the old key.

With the key unset, demo mode stores uploads plaintext and logs `[storage:plaintext]`; with `DEMO_MODE=false` uploads fail closed. A malformed key always throws at first use — there is no silent fallback to plaintext once the key is configured.

### IP access enrichment (optional)

Sign-in access events are stored even when enrichment is not configured. To resolve country/city/ISP/VPN hints after each sign-in, set one or both of:

- **API:** `IP_ENRICHMENT_API_URL` (must include `{ip}`) and optional `IP_ENRICHMENT_API_KEY`
- **Local fallback:** `IP_ENRICHMENT_MMDB_PATH` pointing at a MaxMind-style city database file on the server

Hybrid order: API first (~2s timeout) → local MMDB → store IP/UA only if both fail.

**Production proxy:** On Njalla + Coolify, the reverse proxy must forward the client IP via `X-Forwarded-For` (leftmost hop is used). Without it, events may show the proxy/container address instead of the visitor.

**Private / local IPs:** Loopback and RFC1918 addresses (e.g. `127.0.0.1`, `192.168.*`) skip external lookup; rows get `enrichment_status=partial` and geo shows as unknown/local.

### Auth / admin checklist

1. Put the ops owner email in `SUPER_ADMIN_EMAILS` **before** the app is reachable on a shared/public URL.
2. Set `ALLOW_BOOTSTRAP_SIGNUP=true`, restart, and create that account via `/sign-up` (email + password) so `staff_profiles` is upserted. **Only** emails listed in `SUPER_ADMIN_EMAILS` are accepted while bootstrap is open.
3. Unset `ALLOW_BOOTSTRAP_SIGNUP` and restart. Public investors use **`/apply`** (not self-serve signup). Existing users still sign in at `/sign-in`.
4. Restart after changing `SUPER_ADMIN_EMAILS` or `ALLOW_BOOTSTRAP_SIGNUP`. Do not leave bootstrap signup on a public URL.
5. Promote IBs from `/admin/staff` (Promote IB), then promote agents with a parent IB. Assign investors from `/admin/investors`. See `docs/plan-ops-phase1-verify.md`.
6. **Invite security (CRO R7):** set-password links are single-use with TTL. Do not paste full invite URLs into tickets, Slack, or application logs — store token ids only. Prefer SMTP before volume. See `/admin/aml-checklist`.
7. **Invite email failure runbook:** If SMTP is unset or send fails, `sendTransactionalEmail` returns `sent: false` and the admin UI shows the invite URL plus a “not delivered” warning. Ops must: (a) copy the link from the investor Access panel only, (b) deliver it on a secure channel (encrypted email / Signal / in-person), (c) tell the applicant it expires in **72 hours**, (d) if the link is burned or expired, use **Regenerate invite**, (e) never commit invite URLs to tickets, Slack, or git. When SMTP is configured, confirm `sent: true` in the UI before relying on email-only delivery.
8. Lead lists (Phase 2): create/upload/assign on `/admin/leads`. See `docs/plan-ops-phase2-verify.md`.
9. Call log (Phase 3): open a lead detail → log outcomes/notes; history newest-first. See `docs/plan-ops-phase3-verify.md`.
10. Access enrichment: sign-in rows in `user_access_events`; investor/staff/linked-lead panels on admin detail pages. See `docs/plan-access-enrichment-verify.md`.
11. **Apply-first:** approve applicants on `/admin/investors/[id]` → Approve & invite → investor sets password at `/set-password`. KYC is in `/portal/kyc`; confirm→holding requires KYC approved.

## 3. Database migrate and seed

**After every pull** that touches schema or seed data, from `apps/web` run migrate then seed (order matters):

```bash
npm run db:migrate
npm run db:seed
```

Expected seed output looks like: `Seeded N assets; removed R; multi-income M/N (…)`, with **N ≥ 24** hubs from `scripts/seed-data.json`.

**Consumer catalogue extras (migrations `0012`+`0013` and later):**

- Seed sets `cover_image_url` to `/assets/parking-placeholder.svg` and an `advisory_capacity_eur` raise target so funding bars render honestly (0% funded until holdings exist).
- Ops can edit capacity and image URLs on `/admin/assets`.
- Distributions ledger (`distributions` table) powers portal payment history; record payments on `/admin/distributions`.

**Mobility assets / demo wipe notes:**

- Each seeded asset **requires** a valid `incomeMix` (JSON on `assets.income_mix`): parking-primary mix validated by `lib/assets/income-streams.ts`. Seed **exits with an error** if any row fails validation.
- Seed **deletes** demo `interests` and `holdings` (then the asset rows) for any DB asset whose slug is **not** in the current seed JSON. Treat re-seed as a demo-data wipe for removed catalogue slugs — do not rely on old interests/holdings surviving a catalogue cutover.
- When `DEMO_MODE=false`, `npm run db:seed` **refuses** unless `CONFIRM_SEED=1` (or `true`) is set — protects non-demo environments from accidental wipe.
- Upserts keep matching slugs and refresh fields including `income_mix`.
- Upserts refresh only seed-managed catalogue fields on matching slugs. The ops-managed fields `status`, `cover_image_url`, `gallery_image_urls`, and `advisory_capacity_eur` are set only when a new slug is inserted and are preserved on re-seed, so admin changes made on `/admin/assets` survive `npm run db:seed`. If any ops-posted `distributions` reference holdings of a removed slug, the seed aborts with an explicit error naming the blocker — cancel or reassign those distributions on `/admin/distributions` first; the wipe cannot proceed past them.

Re-export seed JSON from the static file if you still maintain the legacy static catalogue:

```bash
node scripts/export-static-assets.mjs
npm run db:seed
```
## 4. Run locally (`npm run dev`)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Quick checks:

```bash
curl -s http://127.0.0.1:3000/api/health
# {"ok":true}

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/opportunities
# 200 when DATABASE_URL + migrate + seed succeeded
```

## 5. Run with Docker Compose (local viewing)

**Recommended for browsing locally** — Postgres + `next dev` in Docker (no production image build):

```bash
cd apps/web
npm run docker:local
# → http://localhost:3000
```

First run installs node_modules inside a Docker volume and can take a few minutes; later starts are faster. Creates gitignored `.env.docker.local` with secrets if missing.

| Command | What it does |
|---|---|
| `npm run docker:local` | Full local stack (`docker-compose.dev.yml`) |
| `npm run docker:local:host` | Postgres in Docker only; Next on the host (use if app containers fail) |
| `npm run docker:local:prod` | Production Dockerfile build (`docker-compose.yml`) — slow, needs free RAM |

**Port 3000 must be free.** If Compose fails with bind errors or hangs on build, stop a leftover `npm run dev` / `next-server` first (`lsof -nP -iTCP:3000 -sTCP:LISTEN`).

Stop the local stack:

```bash
docker compose -f docker-compose.dev.yml down
```

### Production-style Compose (optional)

From `apps/web` (uses `docker-compose.yml`: production `web` image + `postgres`, documents volume at `/data/documents`):

```bash
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
export SUPER_ADMIN_EMAILS="ops@parkwise.eu"
export BETTER_AUTH_URL="http://localhost:3000"
export NEXT_PUBLIC_APP_URL="http://localhost:3000"
docker compose up -d --build

docker compose exec web npm run db:migrate
docker compose exec web npm run db:seed
```

Or: `npm run docker:local:prod` (writes/uses `.env.docker.local`).

Compose notes:

- `BETTER_AUTH_SECRET` is **required** — `docker compose` fails fast with an error if it is unset (no empty/default secret fallback).
- Postgres is published on localhost only (`127.0.0.1:${POSTGRES_PORT:-5432}:5432`), so it is not reachable from other machines.
- DB credentials default to `parkwise`/`parkwise` for local quick start; override with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (the web service `DATABASE_URL` is built from the same vars). Set a strong `POSTGRES_PASSWORD` for any shared/production deploy.
- `POSTGRES_PASSWORD` must use URL-safe characters (or be percent-encoded): compose interpolates it raw into the web service `DATABASE_URL` (`docker-compose.yml:23`), so characters like `@ : / % #` produce an unparseable connection string for the `web` service while Postgres itself starts fine.
- `DEMO_MODE` defaults to `true`; override with `DEMO_MODE=false` in the environment when legally cleared.

Then register the `SUPER_ADMIN_EMAILS` account at `/sign-up` before exposing the compose URL beyond your machine.

App: [http://localhost:3000](http://localhost:3000).

Backups (gzipped Postgres dump + documents copy; retention pruning, optional GPG encryption and offsite sync):

```bash
./scripts/backup.sh
```

Restore a backup with `./scripts/restore.sh <backup-dir>` (destructive — asks for a `RESTORE` confirmation and takes a pre-restore safety dump first). Scheduling, encryption, offsite copies, and the restore drill: `docs/DEPLOY_NJALLA_COOLIFY.md` → "Backup & restore".

## 6. Manual smoke checklist

Use plan verify docs as needed (`docs/plan1-verify.md`, `docs/plan2-verify.md`, `docs/plan3-verify.md`, `docs/plan-ops-phase1-verify.md`, `docs/plan-ops-phase2-verify.md`, `docs/plan-ops-phase3-verify.md`, `docs/plan-access-enrichment-verify.md`). Core checks:

1. Sign up → `/portal` creates an `investors` row.
2. Non-staff user hitting `/admin` is redirected / forbidden.
3. Email in `SUPER_ADMIN_EMAILS` allows `/admin` (super admin); agents after promotion on `/admin/staff`.
4. `/opportunities` lists ≥24 seeded published assets (parking opportunities).
5. Asset detail shows income mix panel + contractual target / capital-at-risk disclaimer.
6. With `DEMO_MODE=true`, the orange demo banner is visible.
7. Staff can upload a PDF; investor can download from the vault (`DOCUMENTS_DIR`).
8. Mobility assets cutover: see `docs/plan-mobility-assets-verify.md`.

## 7. Tests and build

```bash
npm test
npm run build
```

## 8. Legacy static demo (unchanged)

From the **repo root** (not `apps/web`):

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/
```

The static HTML demo is reference-only. Production traffic should use the Next.js app.

## 9. Roadmap

| Plan | Status | Scope |
|---|---|---|
| **Plan 1** | Merged to `main` | Next.js, auth scaffold, schema, seed, public catalogue |
| **Plan 2** | Merged to `main` | Onboarding, express interest, admin interest queue, skip-log emails, holdings on confirm |
| **Plan 3** | Merged to `main` | Document vault, portfolio polish, hardening, E2E smoke, production checklist |
| **One-server hosting** | Merged / this stack | Better Auth, local Postgres, filesystem vault, Docker/Coolify on Njalla (no Clerk/Neon/R2/Resend/Vercel) |
| **Ops agents Phase 1** | Merged / prior | `super_admin` / `agent` roles, investor pool assignment, scoped admin views |
| **Ops agents Phase 2** | Merged / prior | Lead lists, CSV upload, assign to agents, signup email → lead link |
| **Ops agents Phase 3** | Merged / prior | Lead call attempt log (outcomes, notes, newest-first history) |
| **User access enrichment** | Merged / prior | Sign-in IP/UA capture, hybrid enrichment, ops access history panels |
| **Mobility infrastructure assets** | This branch | `income_mix`, 24+ hubs, catalogue filters, mix panel, partners disclaimer |

Verify docs: `docs/plan1-verify.md`, `docs/plan2-verify.md`, `docs/plan3-verify.md`, `docs/plan-ops-phase1-verify.md`, `docs/plan-ops-phase2-verify.md`, `docs/plan-ops-phase3-verify.md`, `docs/plan-access-enrichment-verify.md`, `docs/plan-mobility-assets-verify.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/DEPLOY_NJALLA_COOLIFY.md`.

Spec (ops): `docs/superpowers/specs/2026-07-18-ops-agents-leads-i18n-design.md` (Phase 3)  
Plan: `docs/superpowers/plans/2026-07-18-ops-agents-phase3.md`

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/opportunities` returns 500 | Missing `DATABASE_URL` or migrations not applied | Set URL, run `db:migrate` + `db:seed` |
| `DATABASE_URL is not set` on seed | Env not loaded | Ensure vars are in `.env.local`; seed script loads that file |
| Sign-in / auth errors | Wrong `BETTER_AUTH_*` / `NEXT_PUBLIC_APP_URL` | Align origins; check secret is set |
| `/admin` always forbidden | Email not in `SUPER_ADMIN_EMAILS` and no agent `staff_profiles` row | Add email to `SUPER_ADMIN_EMAILS` (or promote via `/admin/staff`) and restart |
| Demo banner missing | `DEMO_MODE` set to `false` or `0` (case-insensitive — the only values that hide it) | Unset `DEMO_MODE` or set any other value (e.g. `true`) and restart; the banner shows for every value except `false`/`0`, including unset |
| Document upload disabled | `DOCUMENTS_DIR` unset or not writable | Create the directory; set the env var |
| Production startup rejects `DOCUMENTS_ENCRYPTION_KEY` | Key is missing or malformed while `DEMO_MODE=false` | Generate `openssl rand -hex 32`, set it, restart |
| `Failed to decrypt document` on download | Wrong `DOCUMENTS_ENCRYPTION_KEY` for that file, or corrupted vault file | Restore the original key; restore the file from backup |
| `vitest: command not found` | Dependencies not installed | Run `npm install` inside `apps/web` |

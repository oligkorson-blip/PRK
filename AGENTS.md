# AGENTS.md — house rules for AI agents

Guidance for AI coding agents working in this repository. The reader is assumed to know nothing about the project.

## Project overview

**Parkwise** is a consumer investor platform for professionally managed parking assets in selected European cities (with potential recurring monthly income; parking-primary hubs may add EV charging and related contracted streams). It is **not a live investment offering** — target returns, occupancy, and income mixes are illustrative; capital-at-risk language is part of the product and must not be removed from yield/income surfaces.

The platform is deployed in **demo mode by default** and only becomes a real offering after legal sign-off (`DEMO_MODE=false`). See `apps/web/docs/PRODUCTION_CHECKLIST.md` for the go-live gates.

## Repository layout

```
apps/web/        The canonical app — everything product-facing lives here
docs/            Product/content specs (user stories, contract lifecycle, voice, superpowers plans)
verifier/        Design-goal acceptance criteria + Playwright audit script (see verifier/README.md)
.github/         CI workflow
.cursor/rules/   Consumer copy voice rule (mirrored below)
```

An older root-level static HTML demo was removed — do not resurrect it or serve it on the production domain.

## Canonical app: `apps/web`

Next.js 15 (App Router) + React 19, TypeScript, Better Auth (email/password, 2FA), Postgres + Drizzle ORM, filesystem document vault, optional SMTP via nodemailer, Docker Compose. **Not used:** Clerk, Neon, Cloudflare R2, Resend, Vercel.

Run all JS commands from `apps/web`.

Key directories:

- `app/` — routes: public marketing (`/how-it-works`, `/fees`, `/guides`, …), members-only catalogue (`/opportunities`, `/spaces`, `/help-me-choose` — gated in `lib/auth/route-gate.ts` middleware prefixes plus `requireSessionUserOrRedirect()` at page level; keep both in sync when adding a private route), `(auth)` group (`/sign-in`, `/sign-up`, `/set-password`, …), `/apply` (apply-first investor onboarding), `/portal` (investor: holdings, interests, KYC, documents, contracts, settings), `/admin` (ops: investors, leads, interests, assets, distributions, documents, contracts, staff, aml-checklist, platform), `app/api` (auth, documents, health, ready).
- `lib/` — domain modules, one folder each: `auth`, `db` (schema + client), `access` (sign-in IP/UA enrichment + staff scoping), `assets`, `interests`, `investors`, `leads`, `kyc`, `contracts`, `documents`, `storage`, `portfolio`, `portal`, `apply`, `onboarding`, `staff`, `admin`, `aml`, `email`, `demo-mode.ts`, `csp.ts`, etc.
- `components/` — React components (opportunity detail sections, admin action forms, wizards).
- `drizzle/` — SQL migrations + `meta/` snapshots (generated; never hand-edit).
- `scripts/` — tsx/shell ops scripts: `seed-assets.ts` (+ `seed-data.json`), `ib-backfill.ts`, `check-go-live.ts`, `retention.ts`, `encrypt-documents.ts`, `create-test-users.ts`, `backup.sh` / `restore.sh`, `docker-local.sh`.
- `tests/` — vitest unit suite (~200 files, DB-free, mocks drizzle) + `tests/integration/` (real Postgres).
- `e2e/` — Playwright specs (journey, smoke, responsive, two-factor).
- `docs/` — SETUP.md (env vars, runbook), PRODUCTION_CHECKLIST.md, DEPLOY_NJALLA_COOLIFY.md, OPERATIONS_RUNBOOK.md, per-plan verify docs.

## Environment

- Node **22** via nvm (`.nvmrc` pins 22.23.1). node/npm/npx are not on the default PATH on the dev machine — first run:
  `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`
- Install with `npm install --legacy-peer-deps` (CI uses `npm ci --legacy-peer-deps`).
- Configure via `apps/web/.env.local` (copy from `.env.example`, never commit). Essentials: `DATABASE_URL`, `DOCUMENTS_DIR`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `SUPER_ADMIN_EMAILS`, `DEMO_MODE`. Full table in `apps/web/docs/SETUP.md` — it is the authority on env vars (SMTP, IP enrichment, `DOCUMENTS_ENCRYPTION_KEY`, `FOUR_EYES_THRESHOLD_EUR`, `ALLOW_BOOTSTRAP_SIGNUP`, etc.).
- Public signup is closed by default (apply-first model). Bootstrap the first ops account once with `ALLOW_BOOTSTRAP_SIGNUP=true`, register a `SUPER_ADMIN_EMAILS` email at `/sign-up`, then unset the flag and restart. `SIGNUPS_DISABLED` is legacy and ignored by the code.

## Build and test commands

From `apps/web`:

```bash
npx tsc --noEmit            # typecheck
npx vitest run              # unit tests (hermetic, DB-free)
npm run test:integration    # integration tests (needs a real Postgres, see below)
npm run test:e2e            # Playwright e2e (builds + starts production server itself)
npm run build               # production build
npm run dev                 # dev server on :3000
npm run db:migrate && npm run db:seed   # after any pull touching schema/seed
npm run docker:local        # preferred local browsing: Postgres + next dev in Docker
```

## Database and migrations

- **Never edit an applied migration** in `apps/web/drizzle/` (current head: **0033** — check the highest-numbered file) and never edit `drizzle/meta` snapshots by hand.
- Schema changes: edit `lib/db/schema.ts` (auth tables live in `lib/db/auth-schema.ts`), then `npm run db:generate` to produce a new migration, and commit it alongside the code. CI runs `npx drizzle-kit migrate` against a scratch Postgres, so broken migrations fail the build.
- `npm run db:seed` reseeds the demo catalogue (≥24 hubs from `scripts/seed-data.json`) and **wipes interests/holdings for removed slugs**. With `DEMO_MODE=false` it refuses unless `CONFIRM_SEED=1`.

## Testing strategy

Three suites, all blocking in CI:

- **Unit** (`npx vitest run`): `tests/*.test.ts(x)` plus colocated `*.test.ts` in `app/`, `components/`, `lib/`. Hermetic — every drizzle call is mocked, no DB. `tests/integration` is excluded in `vitest.config.ts`.
- **Integration** (`npm run test:integration`): `tests/integration/*.integration.test.ts` against real Postgres; each file builds its own scratch database (`parkwise_it_*`) via `PARKWISE_TEST_DATABASE_URL`, runs migrations, mocks only the session. Files run serially. No DB configured → skips cleanly with exit 0; configured-but-unreachable → fails loudly. Covers the most privileged mutations (staff promote/demote, lead assignment, apply approve & invite, interests, distributions).
- **E2E** (`npm run test:e2e`): Playwright (`e2e/`), chromium + responsive projects, boots its own production build (`npm run build && npm run start`, never reuses a dev server). Needs a migrated+seeded DB and test users (`scripts/create-test-users.ts`).

Add or update vitest coverage for behavior you change; keep edits scoped to the files your task names.

There is also a design-goal verifier at repo root (`verifier/v1/check.cjs`, Playwright) measuring layout/console/a11y/art-direction criteria — see `verifier/README.md`; it requires the app running on :3000.

## Code conventions

### Server actions

- Return `{ ok: true, ... }` on success and `{ ok: false, error }` for expected failures — do not throw for expected validation/authz failures.
- Authorization checks live **inside** the action, not in the page/component caller.
- Staff scoping: staff roles are `super_admin`, `ib` (introducing broker), `agent`. Agents/IBs see only investors visible via `investorVisibleToStaff` (`lib/access/scope.ts`, `lib/auth/staff.ts`); super admins are unrestricted. New staff-facing queries must apply the same scope. Every agent belongs to exactly one IB; leads carry a parent IB separate from the assigned agent.

### Demo mode

- `lib/demo-mode.ts` is the single source of truth: the deployment is a demo **unless** `DEMO_MODE` is explicitly `"false"` or `"0"` (case-insensitive, trimmed). Unset or any other value = demo — fail-safe.
- `isExplicitDemoMode()` exists for checks that must fail closed (e.g. plaintext document writes): true only for `"true"`/`"1"`.
- Any new demo-only behavior (banners, seed guards, gated features) must go through these helpers and preserve fail-safe semantics; never introduce a second DEMO_MODE parser.

### Consumer copy voice (`.cursor/rules/consumer-copy-voice.mdc`)

- Public/investor-facing UI: short plain English, benefit + concrete CTA, calm adult tone. Never say "hubs" in consumer copy — use "opportunities"/"places"/"locations". No advisory language ("recommended for you", "safer", "lower risk"). Keep illustrative / capital-at-risk disclaimers.
- Admin/ops/staff UI may stay precise and operational.

### Style

TypeScript strict, path alias `@/` → `apps/web` root, zod for validation. Match the surrounding file's idioms; make minimal, reviewable diffs.

## Security considerations

- **AuthN/Z:** Better Auth email/password with optional 2FA; middleware (`middleware.ts`) does session-cookie route gating and assembles a per-request-nonce CSP (`lib/csp.ts`). `next.config.ts` sets security headers (HSTS in prod, nosniff, DENY framing, etc.) and `private, no-store` on `/admin`, `/portal`, `/api`.
- **Document vault:** filesystem storage under `DOCUMENTS_DIR`. With `DOCUMENTS_ENCRYPTION_KEY` set (required when `DEMO_MODE=false`), uploads are AES-256-GCM encrypted at rest (`PWENC1` format); losing the key makes documents unrecoverable. Without a key, non-demo uploads fail closed. `scripts/encrypt-documents.ts` encrypts an existing plaintext vault in place (idempotent).
- **Invite links:** set-password links are single-use with a 72h TTL. Never paste full invite URLs into tickets, chat, logs, or git. Without SMTP, `sendTransactionalEmail` skip-logs (`[email:skip]`) and ops deliver links manually over a secure channel.
- **Four-eyes rule:** interests at/above `FOUR_EYES_THRESHOLD_EUR` (default €50,000) need two distinct super admin approvals before confirm→holding.
- **Auditability:** privileged mutations (assignments, promotions, confirmations) write audit events and run in transactions; the integration suite exists to test these for real.
- Never commit `.env.local` / `.env.docker.local` or secrets of any kind.

## CI and deployment

- GitHub Actions `.github/workflows/web-ci.yml` runs on PRs and pushes to `main` touching `apps/web/**`. Three jobs, all against a postgres:16-alpine service:
  - **ci**: `npm ci --legacy-peer-deps` → `drizzle-kit migrate` → `tsc --noEmit` → `vitest run` → `next build`
  - **integration**: migrate → integration vitest suite
  - **e2e**: migrate → seed → create test users → build → start → Playwright
- Keep it green. Use `npm ci --legacy-peer-deps` semantics when changing dependencies.
- **Deployment:** one Njalla VPS + Coolify + Docker Compose (`web` + Postgres + documents volume) — see `apps/web/docs/DEPLOY_NJALLA_COOLIFY.md`. Before flipping `DEMO_MODE=false`, complete `apps/web/docs/PRODUCTION_CHECKLIST.md` (includes `npm run check:go-live`). Backups: `scripts/backup.sh` / `scripts/restore.sh`.

## Out of scope

- **Opportunity shortlist / side-by-side compare tool** — not planned. Catalogue filters and detail pages cover discovery; do not add save-and-compare UX.

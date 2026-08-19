# Parkwise one-server crypto-paid hosting design

**Date:** 2026-07-18  
**Status:** Approved (2026-07-18)  
**Supersedes (for hosting/auth/storage only):** Clerk + Neon + Vercel + R2 + Resend launch path in `2026-07-18-investor-platform-mvp-design.md`  
**Does not change:** Product scope (express interest, manual confirm, portfolio, document vault, `DEMO_MODE`, out-of-scope payments/KYC/custody)

## Goal

Run the investor platform MVP on **one VPS**, with **paid third parties limited to vendors that accept cryptocurrency**. Target scale: **up to ~500 users**. Prefer a **beginner-friendly** path (click / copy-paste over raw SSH ops).

## Constraints

| Constraint | Choice |
|---|---|
| Hosting model | Single server (app + DB + files) |
| Vendor payments | Crypto accepted (BTC/XMR/etc.) |
| Operator skill | Beginner — Coolify UI over hand-rolled Docker day-to-day |
| Product crypto | **No** — app stays fiat/off-chain investor flows; crypto is for **paying infra only** |
| Sequencing | Simplify stack in code, then ship (not ship-then-migrate) |

## Target stack

| Piece | Choice | Notes |
|---|---|---|
| Domain + VPS | **Njalla** | Paid in crypto; one primary vendor |
| Deploy panel | **Coolify** | Free software; HTTPS via Let’s Encrypt |
| App | Next.js (`apps/web`) on the VPS | Same product as Plan 1–3 |
| Database | **Postgres** in Docker on the VPS | Keep Drizzle + migrations |
| Document files | **Local Docker volume** | Replaces Cloudflare R2 |
| Auth | **Better Auth** (or Auth.js) | Email + password; replaces Clerk |
| Email (launch) | **None** | Ops uses admin interest queue; no Resend |
| Git (optional) | **Gitea** on same VPS | Avoid GitHub if zero non-crypto vendors desired |

### Explicitly not used for launch

Vercel, Clerk, Neon, Supabase, Cloudflare R2, Resend, and card-only mainstream VPS hosts (Hetzner/DigitalOcean as direct checkout).

### Free / no-invoice tools (allowed)

Coolify, Let’s Encrypt, Better Auth / Auth.js, Drizzle, Node — no payment required.

## Auth & admin

- Email + password for MVP (magic link deferred until a crypto-compatible or self-hosted SMTP exists).
- Session cookies on the app domain over HTTPS.
- Keep `investors` table; rename `clerk_user_id` → `auth_user_id` (internal auth user id).
- On first authenticated visit, create investor row (same behavior as today).
- Admin is **not** self-serve: bootstrap via `ADMIN_EMAILS` (and/or `investors.role = 'admin'`).
- Audit actor field: rename `actor_clerk_id` → `actor_user_id`.
- Routes stay: `/sign-in`, `/sign-up`, `/portal`, `/admin` — Clerk components replaced with simple forms.
- No migration of existing Clerk users; greenfield DB on the new server is fine.

## Data, documents, email

- `DATABASE_URL` points at in-compose Postgres (e.g. `postgres:5432` on the Docker network).
- Document upload/download uses filesystem under a mounted volume (e.g. `/data/documents`) with the same authorization rules as the R2 vault.
- Interest emails deferred; admin console remains source of truth for pending interests.
- Keep `DEMO_MODE=true` until counsel signs off on legal pages.
- Minimum backups: scheduled Postgres dump + documents volume copy; document steps in SETUP; simple cron in implementation.

## Deploy & cutover

1. Register/pay **Njalla** (crypto) for domain + VPS; DNS → VPS.
2. Install Coolify (vendor one-line installer).
3. Deploy Compose: `web` + `postgres` + `documents` volume.
4. Set secrets/env: `DATABASE_URL`, `DEMO_MODE`, `ADMIN_EMAILS`, `AUTH_SECRET`, etc.
5. `db:migrate` + `db:seed`.
6. Sign up as the admin email; verify `/admin`.
7. Smoke: onboarding → express interest → admin confirm → upload PDF → investor download.

### Code migration scope

- Remove launch dependency on Clerk, Neon serverless, R2, Resend.
- Add Better Auth (or Auth.js), local storage adapter, Docker Compose + Coolify-oriented docs.
- Update `apps/web/docs/SETUP.md` and `PRODUCTION_CHECKLIST.md` for this hosting model.
- Preserve product behavior from Plans 1–3 (catalogue, onboarding, interests, holdings, admin asset status, document vault).

### Out of scope

Payments/custody/KYC vendors, secondary market, multi-region HA, mandatory GitHub, crypto/on-chain product features.

## Success criteria

- Public HTTPS URL on the Njalla domain.
- Only **Njalla** as a required paid third party for launch.
- Full MVP flows work for ≤500 users with `DEMO_MODE=true`.
- Document vault works without R2.
- Admin can operate without email notifications.

## Relationship to prior MVP spec

Product rules in `docs/superpowers/specs/2026-07-18-investor-platform-mvp-design.md` remain authoritative for interest state machine, roles, legal/demo language, and out-of-scope finance features. This document replaces only the **infrastructure and auth provider** choices for the go-live path.

## Locked implementation defaults

- **Auth library:** Better Auth (email + password). Switch to Auth.js only if Better Auth blocks App Router integration during implementation.
- **Git in v1:** Not required. Deploy via Coolify from a git URL the operator provides, or from a connected repo; **Gitea is optional phase-2** on the same VPS if GitHub must be avoided entirely.
- **VPS size:** Start at **≥2 GB RAM** (prefer 4 GB if budget allows) for Node + Postgres + Coolify overhead.

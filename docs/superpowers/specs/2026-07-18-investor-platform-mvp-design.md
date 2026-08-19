# Parkwise Investor Platform MVP Design

## Goal

Replace the static demo with a real investor platform MVP: authenticated accounts, admin-managed opportunities, express-interest commitments confirmed manually by ops, a basic portfolio for confirmed holdings, and a document vault — while preserving the existing Parkwise brand, marketing copy, and risk language.

## Product Decisions (Locked)

| Decision | Choice |
|---|---|
| Product type | Real investor platform MVP (not demo-only, not lead-gen-only) |
| Commitment model | Express interest only; ops confirms or declines manually |
| Auth | Clerk (investor + admin roles) |
| App framework | Next.js App Router + TypeScript |
| Database | Neon Postgres |
| File storage | Cloudflare R2 (S3-compatible) for PDFs |
| Hosting | Vercel |
| Payments / custody | Out of scope for MVP |
| KYC provider | Out of scope; manual eligibility + admin review queue |

## Scope

### In scope

- Marketing pages ported from the current static site (home, opportunities, how it works, why parking, about, documents landing)
- Clerk sign-up / sign-in / session management
- Roles: `investor`, `admin`
- Investor onboarding: profile fields + suitability questionnaire + acceptance of T&Cs and risk disclosure
- Public opportunity catalogue backed by Postgres
- Opportunity detail page with express-interest action
- Interest status machine: `pending` → `confirmed` | `declined` | `withdrawn`
- Investor portal: interest queue, confirmed holdings, contractual target income summary, document list
- Admin console: assets CRUD, interest queue, confirm/decline with note, mark investor active/suspended, upload documents
- Audit log for auth-sensitive and money-adjacent actions
- Explicit `DEMO_MODE` env flag that shows demo banners and blocks treating data as live investment advice

### Out of scope

- Payment collection, bank transfers, escrow, or custody
- Hard capacity reservation that blocks oversubscription automatically (ops may oversubscribe; capacity is advisory)
- Full third-party KYC/AML provider integration
- Secondary market, transfers, early exit
- Multi-currency, tax forms, IFRS reporting
- Native mobile apps
- Email marketing automation beyond transactional Clerk/auth and basic interest-status emails
- Rewriting brand identity or marketing thesis

## User Journeys

### Investor

1. Lands on marketing site → browses opportunities (public).
2. Signs up / signs in via Clerk.
3. Completes onboarding (profile, eligibility answers, accept T&Cs + risk disclosure). Until complete, express-interest is disabled.
4. Opens an opportunity → submits express interest (amount, optional note).
5. Sees interest as `pending` in portal.
6. Receives email when admin confirms or declines.
7. If confirmed, holding appears in portfolio with contractual target yield figures and linked documents.

### Admin

1. Signs in with Clerk user that has `admin` role (Clerk public metadata `role=admin`).
2. Creates/updates/publishes assets.
3. Reviews interest queue; confirms or declines with an internal note.
4. Uploads PDFs to an asset or investor holding.
5. Suspends or reactivates an investor account flag in app DB (Clerk account remains; app gate rejects actions).

## Information Architecture

```
/                     marketing home
/opportunities        catalogue
/opportunities/[slug] detail + express interest
/how-it-works         marketing
/why-parking          marketing
/about                marketing
/documents            marketing + link to vault when signed in
/sign-in, /sign-up    Clerk
/onboarding           gated multi-step form
/portal               investor home (interests + holdings summary)
/portal/holdings      confirmed holdings
/portal/documents     document vault
/admin                admin home
/admin/assets         asset CRUD
/admin/interests      interest queue
/admin/investors      investor list + status
```

Static HTML files in the repo root remain until the Next.js app ships pages that replace them; cutover is a deploy switch, not a gradual mixed stack in production.

## Architecture

```
Browser
  → Next.js (Vercel) App Router
      → Clerk middleware (session, role checks)
      → Server Actions / Route Handlers
      → Neon Postgres (Drizzle ORM)
      → R2 (presigned upload/download for PDFs)
  → Clerk-hosted auth UI / SDK
```

### Application layout

```
apps/web/                 Next.js application
  app/                    routes (marketing, portal, admin, api)
  components/             UI (port of existing visual system)
  lib/
    db/                   Drizzle schema + client
    auth/                 Clerk helpers, role guards
    storage/              R2 client
    audit/                append-only audit writer
  styles/                 ported design tokens from css/style.css
packages/                 none for MVP (keep monolith app)
```

Monorepo tooling: `apps/web` inside the existing git repo. Root README documents how to run the static legacy site vs the app.

## Data Model

Primary tables (Postgres):

### `investors`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| clerk_user_id | text unique | Clerk user id |
| email | text | denormalized from Clerk for admin lists |
| full_name | text | |
| country | text | |
| phone | text nullable | |
| onboarding_status | enum | `started`, `completed` |
| account_status | enum | `active`, `suspended` |
| eligibility_answers | jsonb | questionnaire payload |
| terms_accepted_at | timestamptz nullable | |
| risk_accepted_at | timestamptz nullable | |
| created_at / updated_at | timestamptz | |

### `assets`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | URL key |
| name, operator, city, district, country | text | |
| target_yield_pct | numeric(5,2) | contractual target, never labeled guaranteed |
| tier | text | Standard / Plus / Premium |
| min_ticket_eur | integer | |
| spaces | integer | |
| occupancy_pct | numeric(5,2) | |
| lease_label | text | e.g. "12 years" |
| blurb | text | |
| status | enum | `draft`, `published`, `closed` |
| advisory_capacity_eur | integer nullable | display only |
| created_at / updated_at | timestamptz | |

### `interests`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| investor_id | uuid FK | |
| asset_id | uuid FK | |
| amount_eur | integer | |
| note | text nullable | investor-facing |
| status | enum | `pending`, `confirmed`, `declined`, `withdrawn` |
| admin_note | text nullable | internal |
| decided_by | text nullable | Clerk admin user id |
| decided_at | timestamptz nullable | |
| created_at / updated_at | timestamptz | |

Constraint: one open interest (`pending`) per investor per asset. Confirmed interests may convert to holdings.

### `holdings`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| investor_id | uuid FK | |
| asset_id | uuid FK | |
| interest_id | uuid FK unique | source interest |
| amount_eur | integer | |
| target_yield_pct | numeric(5,2) | snapshot at confirmation |
| status | enum | `active`, `closed` |
| confirmed_at | timestamptz | |
| created_at / updated_at | timestamptz | |

### `documents`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| owner_type | enum | `asset`, `holding`, `platform` |
| owner_id | uuid nullable | null for platform-wide |
| title | text | |
| category | text | e.g. KID, IM, contract |
| r2_key | text | |
| content_type | text | |
| uploaded_by | text | Clerk user id |
| created_at | timestamptz | |

### `audit_events`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| actor_clerk_id | text | |
| action | text | e.g. `interest.created`, `interest.confirmed` |
| entity_type | text | |
| entity_id | uuid nullable | |
| payload | jsonb | non-secret metadata |
| created_at | timestamptz | |

Append-only; no updates or deletes from application code.

## Status Machines

### Interest

```
pending → confirmed → (creates holding)
pending → declined
pending → withdrawn   (investor cancels before decision)
```

No transitions out of `confirmed` or `declined` in MVP except admin correcting via a new interest (rare; prefer admin_note + support process).

### Onboarding

```
started → completed
```

`completed` requires: profile fields present, eligibility answers saved, `terms_accepted_at` and `risk_accepted_at` set.

## Authorization Rules

- Public: marketing pages, published assets list/detail (read).
- Signed-in investor with incomplete onboarding: can access `/onboarding` only among app routes (plus sign-out).
- Active investor with completed onboarding: portal + express interest.
- Suspended investor: read-only portal; cannot create interests.
- Admin role (Clerk `publicMetadata.role === "admin"`): full admin console; cannot be granted via self-serve UI in MVP (set in Clerk dashboard).

All mutations go through server actions / route handlers that re-check Clerk session and role; never trust client-only gates.

## Express Interest Behavior

- Button visible on published asset detail when investor is onboarded and active.
- Form: amount (integer EUR ≥ asset `min_ticket_eur`), optional note (max 500 chars).
- Creates `interests` row with `pending`.
- Writes `audit_events` `interest.created`.
- Sends transactional email to investor (“we received your interest”) and to a configured ops inbox.
- Admin confirm: creates `holdings` snapshot, sets interest `confirmed`, emails investor.
- Admin decline: sets `declined`, emails investor with generic message (no legal advice).

Capacity (`advisory_capacity_eur`) is shown in admin UI as guidance only; confirmation is never blocked by it in MVP.

## UI / Brand

- Port CSS variables and component patterns from `css/style.css` into the Next.js app (CSS modules or global CSS — global port first for speed).
- Preserve risk line: contractual targets are never guaranteed; capital at risk.
- Every page that shows yield includes the existing disclaimer pattern.
- When `DEMO_MODE=true`, show a persistent top banner: “Demonstration environment — not live offerings.”

## Email

MVP uses:
- Clerk emails for auth (verify, reset).
- App-triggered transactional emails via Resend for interest received / confirmed / declined.

From-address: `noreply@` configured domain (must be verified before production).

## Environment & Config

Required secrets (Vercel + local `.env.local`, never committed):

- `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `DATABASE_URL`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` (if any)
- `RESEND_API_KEY`
- `OPS_INBOX_EMAIL`
- `DEMO_MODE` (`true`/`false`)

## Security & Compliance Baseline

- TLS everywhere (Vercel default).
- No secrets in client bundles.
- Presigned URLs for document download; no public bucket listing.
- PII minimized in audit payloads (ids + action, not full questionnaire dumps unless necessary).
- Rate-limit express-interest endpoint (edge middleware or server action guard: max 10/hour/investor).
- Legal pages: Terms, Privacy, Risk Disclosure — linked from onboarding; content provided by counsel before production launch.
- Marketing and product copy must not say “guaranteed return,” “risk-free,” or “approved by regulator” unless counsel supplies approved wording.

## Migration from Static Demo

1. Seed `assets` from current `js/data.js` catalogue.
2. Keep root static HTML available locally for reference until Next.js marketing parity is signed off.
3. Production cutover: deploy `apps/web` to Vercel; point domain to Vercel; do not serve demo portal login that accepts arbitrary passwords.
4. Retire static `portal.html` / `register.html` / `dashboard.html` from production paths.

## Testing Strategy

- Unit: status transition helpers, amount validation, role guards.
- Integration: Drizzle queries against a test Neon branch or local Postgres.
- E2E (Playwright): sign-in (Clerk test users), onboarding happy path, express interest, admin confirm → holding visible.
- Manual: mobile nav, disclaimer visibility, DEMO_MODE banner.

## Success Criteria

MVP is done when:

1. A new investor can register, complete onboarding, express interest, and see status updates.
2. An admin can publish an asset, confirm an interest, and the investor sees a holding + document.
3. Demo open-password portal is not reachable in production.
4. Audit log records interest create/confirm/decline.
5. Staging environment runs with `DEMO_MODE=true`; production launch checklist includes counsel sign-off on legal pages.

## Phased Delivery

Aligned to the CTO sequence:

0. Foundations — repo remote, `apps/web` scaffold, CI, env templates, token port  
1. Auth + roles — Clerk middleware, investor record sync, admin gate  
2. Catalogue — assets schema, public pages, seed from `data.js`  
3. Onboarding — profile + eligibility + acceptances  
4. Interests — express interest + admin queue + emails  
5. Portfolio + documents — holdings, vault, R2 uploads  
6. Hardening — audit coverage, rate limits, E2E, production checklist  

Each phase must leave staging deployable.

## Non-Goals Recap

No payments, no automated KYC vendor, no hard capacity locks, no secondary market, no rebrand.

# Assisted KYC + Flow Fixes — Design

Date: 2026-07-23
Status: Approved (design review in session)
Scope: `apps/web`

Two workstreams:

1. **Agent-assisted manual KYC** — staff can complete KYC/onboarding steps on behalf of an investor who hasn't done them.
2. **Flow fixes** — all findings from four review areas: auth, 2FA/account security, content/legal, opportunity catalogue.

---

## Workstream 1 — Agent-assisted manual KYC

### Intent

KYC is completed manually by staff when the investor has not done it themselves. Staff can, on behalf of an investor: upload KYC documents, fill onboarding profile data, accept onboarding declarations, and set KYC status (already exists). The investor's self-serve path (`/portal/kyc`, `/onboarding`) is unchanged and always available; assisted actions are additive.

### Actors & authorization

- Any staff role may perform assisted actions **within their scope**: agents/IBs only for investors in their book, super admins (ops) unrestricted.
- Every server action re-checks `investorVisibleToStaff` (`lib/access/scope.ts`) — authorization inside the action, never in the caller (house rule).
- Out-of-scope investor → `{ ok: false, error: "Not found" }` (no existence oracle).

### UI placement

New "Assisted KYC" section inside the **KYC tab** of the investor detail page (`app/admin/investors/[investorId]`, `components/admin-investor-detail-tabs.tsx`). No new pages.

The section contains:

1. **Document upload form** — mirrors the investor upload (`components/kyc-upload-form.tsx`): category select (kyc_id / kyc_address / kyc_company / kyc_other), title, file (PDF/JPEG/PNG, ≤10 MB).
2. **Profile data form** — the onboarding fields: full name, country, phone, DOB, nationality, residential address, investment horizon, source of funds, PEP declaration. Prefilled from the investor's current row.
3. **Accept declarations action** — a clearly-labeled button ("Complete onboarding on behalf of investor") with the four acknowledgements listed, enabled only when profile data validates.
4. **KYC status actions** — existing approve/under-review/reject buttons (`components/admin-investor-access-actions.tsx`), unchanged.

### Server actions

New files: `lib/kyc/assisted-actions.ts` (document upload) and `lib/onboarding/assisted-actions.ts` (profile data + declarations). KYC status uses the existing `setKycStatus`.

- `assistedKycUpload(investorId, { category, title, file })`
  - Reuses the investor upload pipeline from `lib/kyc/actions.ts`: MIME + magic-byte sniffing, 10 MB cap, category validation, storage-write-then-DB-insert with cleanup on failure, 10-file cap.
  - Document owner = investor (same ownerType/scoping as self-uploaded) so it appears identically in the investor vault and admin KYC tab.
  - Audit event `kyc.assisted_upload` with staff id, investor id, document id.
- `assistedOnboardingProfile(investorId, fields)`
  - Validates with the same Zod schema as `lib/onboarding/schema.ts`; writes the same `investors` columns.
  - Does not null out an existing phone when the field is left blank — partial edits preserve existing data.
  - Audit event `onboarding.assisted_profile_saved`.
- `assistedAcceptDeclarations(investorId)`
  - Refuses unless the full onboarding profile validates (same rules as `completeOnboarding`).
  - Sets the same acceptance timestamps/flags and `onboardingStatus: "completed"` as `completeOnboarding` (`lib/onboarding/actions.ts`).
  - Audit event `onboarding.assisted_completed` with staff id.
- Audit log only — no mandatory note field, no investor notification email (per product decision).

### Data flow

No schema changes expected: documents, investor columns, acceptance timestamps, and audit events all already exist. If any column is missing (discovered during implementation), follow the house migration rule: edit `lib/db/schema.ts`, `npm run db:generate`, commit the new migration; never edit applied migrations (head: 0017).

### Testing

Vitest coverage for: scoping (agent cannot act on out-of-book investor), assisted upload validation paths, declarations gating on valid profile, audit events emitted, investor self-serve still works after assisted completion.

---

## Workstream 2 — Flow fixes

### Area 3: Auth flows (8 findings)

1. **Password bounds mismatch** — single shared constant (min 10, max 128) used by sign-up, set-password, and reset-password forms; client `minLength`/`maxLength` aligned with `lib/auth/auth.ts`.
2. **Forgot-password failure handling** — try/catch around `requestPasswordReset`; always reset `pending`; generic error ("couldn't send, try again or contact contact@parkwise.eu").
3. **Raw Better Auth errors on sign-in** — map known codes to friendly copy; generic fallback "Sign in failed. Try again or contact support."
4. **Activation double sign-in** — after `setPasswordWithInvite` succeeds, sign the user in directly (`signIn.email` with the just-set password) and land in `/portal` (which routes to `/onboarding` if incomplete).
5. **Auth chrome consistency** — shared auth layout: same footer treatment for all five auth pages, `robots: noindex` on all of them.
6. **Email verification gap** — code comment/guard in `lib/auth/auth.ts` noting verification must be enabled if signup opens beyond bootstrap.
7. **Bootstrap flag exposure** — startup warning log when `ALLOW_BOOTSTRAP_SIGNUP=true`.
8. **Password guidance** — one line of hint copy under new-password fields ("Use at least 10 characters").

### Area 4: 2FA & account security (10 findings)

1. **Investor 2FA recovery** — new admin-side action `resetInvestorTwoFactor` (super admin only, audited, revokes sessions, blocks self-reset) mirroring `lib/staff/two-factor-actions.ts`; replace "contact a super-admin" copy with support email.
2. **Staff 2FA enforcement** — `app/admin/layout.tsx` (or `getStaffContext`) redirects staff without `twoFactorEnabled` to `/account/security`.
3. **Self-serve management** — password-confirmed "regenerate backup codes" and "disable / re-set up authenticator" on the enabled state (`twoFactor.disable`, `generateBackupCodes`).
4. **QR at enrollment** — render QR client-side with a small local QR library (one new dependency, e.g. `qrcode` — secret never leaves the client).
5. **Post-2FA destination** — resolve by staff context: staff → `/admin`, investors → `/portal`; fixes both `two-factor-challenge.tsx` and the sign-in page redirect.
6. **Trusted device** — "Trust this device for 7 days" checkbox wired to the existing `trustDeviceMaxAge` config.
7. **Rate limits** — custom rules for `/two-factor/verify-totp` and `/two-factor/verify-backup-code` (e.g. 5/min) in `lib/auth/auth.ts`.
8. **Session security surface** — settings page shows recent sign-ins (data already in access events) and a "revoke other sessions" button.
9. **Challenge recovery guidance** — "Lost access to your authenticator? Contact ops@parkwise.eu" under the backup-code toggle.
10. **E2E coverage** — Playwright spec: enroll → challenge → backup-code login (if the `e2e/` harness exists; otherwise extend existing vitest coverage of the flow).

### Area 1: Content & legal (8 findings)

1. **Legal metadata** — `metadata` export (neutral title + description) on risk, terms, privacy, cookies pages.
2. **Legal versioning** — "Effective / last updated" line per legal page, sourced from one constants file.
3. **Fee copy alignment** — marketing copy matches the qualified Terms wording ("No platform fee today; any opportunity-level costs are in its documents").
4. **Complaints escalation** — one sentence naming the applicable redress route or precisely why statutory escalation doesn't apply.
5. **Guide cross-linking** — "Related guides" block (2–3 links from the catalog's categories) + "← All guides" breadcrumb per article.
6. **Article JSON-LD** — on guide pages (headline, dateModified from the review stamp, author = Organization).
7. **Guides index risk line** — standard risk line + `/legal/risk` link on `app/guides/page.tsx`.
8. **Copy defects** — fix stray space in `how-hub-income-is-stacked` metadata; move per-article review dates into `lib/guides/catalog.ts` and render from one field.

### Area 2: Opportunity catalogue (9 findings)

1. **"Recommended" badge** — removed from display; replaced by factual derived labels ("Lowest minimum", "Highest target") computed from option data. The `recommended` flag in `lib/assets/investment-options.ts` validation becomes internal-only (or is dropped from validation if nothing consumes it).
2. **Term-sheet summary** — new "Key terms" section on the detail page, built from existing `lib/assets/commercial-terms.ts` data (structure, fees, lease, exit). No new document uploads.
3. **Illustrator downside** — adverse-scenario row (e.g. income at 50% of target, and at zero) + visible assumptions note (gross of tax, before costs, target basis) in `components/opportunity-detail-returns.tsx`.
4. **Mobile sticky CTA** — add `RISK_LINE` to the mobile bar; remove the hidden-amount compact submission — route to the full form instead.
5. **Yield band vs sort/filter** — sort/filter and card display use the same basis: display the recommended option's yield with "up to X%" qualifier, or sort on band max. One semantics, applied consistently.
6. **"Risks up front" lead** — soften the catalogue lead copy and add `RISK_LINE_SHORT` to cards.
7. **Yield-chasing affordances** — neutral default sort; brief qualifier near the yield filter.
8. **Demand boilerplate** — cut the generic paragraph in `opportunity-detail-location.tsx` (provenance-labelled stats carry the section).
9. **Fully-funded social proof** — "N opportunities fully funded" line near the catalogue count; funded assets remain filterable.

---

## Cross-cutting requirements (house rules)

- Server actions return `{ ok: true, ... }` / `{ ok: false, error }`; no throws for expected failures.
- Demo-mode semantics untouched (`lib/demo-mode.ts` stays the single source of truth).
- Every behavior change gets vitest coverage; run `npx tsc --noEmit`, `npx vitest run`, `npm run build` from `apps/web` before done.
- Node via nvm: `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`.

## Out of scope

- Fee-model quantification, legal-entity identity, simulator yield sourcing, stale-clear AML gate, KYC decision emails, distribution four-eyes, holdings/payments admin tab, document retraction (P0/P1 items outside the four selected areas).
- Any change to the investor self-serve KYC/onboarding UX beyond what the findings require.

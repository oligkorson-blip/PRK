# Parkwise UX + apply-first access — Design

**Status:** Approved directions + companion productization (see `2026-07-19-productization-asset-legal-design.md`)  
**Date:** 2026-07-19  
**Honesty:** Visitor-facing “demonstration platform” framing is **removed** under productization. Keep capital-at-risk and contractual-target language. Operator non-endorsement remains in legal.  
**Depends on:** Existing `apps/web` investor platform (Better Auth, interests/holdings, mobility `income_mix`, admin ops)  
**Primary visual references:** Root static HTML (`index.html`, `opportunities.html`, `how-it-works.html`, `why-parking.html`, `about.html`, `documents.html`, `portal.html`, `register.html`, `dashboard.html`) + mockup `Parkwise-Smarter-Parking-Investments-07-17-2026_02_50_PM.png`  
**Flow reference:** [21vh.com/register](https://21vh.com/register) (wizard structure only — Parkwise brand; no 21 VH dark theme; no AMF / “guaranteed returns” claims)

## Goal

Bring the **best UX/UI from the original HTML demo** into the live Next.js app, and change access to an **apply-first** model: public application creates a **pending investor**; ops unlocks access; investor **sets password after approval**; full **KYC upload**; investor area uses the **dashboard.html shell** while keeping today’s working product logic (interests → confirm → holdings, docs vault, admin CRM, mobility catalogue).

## Expert revision notes (rev 2)

This pass hardens the v1 draft against common launch failures:

- Explicit **lifecycle state machine** (no ambiguous “pending” overlapping KYC vs account)
- **Idempotent apply** / duplicate-email rules
- **Login identity** = application email (company authorised contact may differ for CRM only)
- **Invite security** (token expiry, single-use, admin regenerate) even when email is skip-log
- **KYC post-approval only** in the dashboard; express interest does not require KYC; confirm→holding still requires KYC `approved`
- **KYC minimum packs** by account type + resubmit after reject
- **Gate matrix** covering express interest vs ops confirm
- **Bootstrap exception** so `SUPER_ADMIN_EMAILS` can still create the first ops user when signup is locked
- **HTML harvest priority** (P0 must-ship vs P1 polish) so implementation doesn’t stall on every SVG
- Migration rules for **existing `active` investors**

---

## Locked product decisions

| Topic | Choice |
|---|---|
| Access model | Apply-first; public self-serve signup closed |
| Pending account | Create `investors` with `pending_access` at apply (`authUserId` null) |
| Password | After ops approval via **set-password invite** |
| Application UX | 21 VH–style 3 steps + Parkwise / `register.html` chrome |
| Auth user creation | Only on ops unlock |
| Login email | The **application email** (unique). Company “authorised contact” name may differ; login email is the application email |
| Portal shell | `dashboard.html` layout **merged** with current interests / holdings / docs / KYC |
| KYC | **After ops approval only**, inside the investor dashboard (`/portal/kyc`); never on public `/apply`. See gate matrix |
| Visual system | Cream / green / lime; port HTML art, cards, simulator, auth card |
| Honesty | Capital at risk; contractual targets. No visitor “demo platform” framing (see productization spec). No regulator-approval claims |

## Non-goals / out of scope

- Real SMTP (v1: skip-log + **admin-copyable invite URL**; SMTP later)
- Public “express interest” without an unlocked account
- Live operator APIs / real banked payouts / real KYC vendor (Onfido, etc.)
- Pixel clone of 21 VH
- Removing mobility thesis, income mix, admin leads/calls
- Serving root `*.html` in production
- Multi-language application wizard (EN only v1)

---

## End-to-end lifecycle

```text
Apply (public)
  → investor pending_access + application submitted + lead
  → ops Contacted (optional)
  → ops Approve & invite
       → Better Auth user created
       → investor active
       → application approved
       → set-password token (TTL)
  → investor sets password → sign-in
  → onboarding questionnaire (existing)
  → dashboard available (Overview / Interests / Holdings / Documents / **KYC**)
  → express interest when onboarding complete (KYC **not** required to express)
  → KYC upload in dashboard (any time after unlock) → submitted → ops review → approved | rejected→resubmit
  → ops confirm interest → holding **requires** KYC `approved`
```

**Clarification:** KYC is a **dashboard task after approval**, not an application step. Applicants do not upload ID on `/apply`.

**Reject path:** application `rejected`; investor stays `pending_access` (or `suspended` if abuse); no auth user.

---

## Part A — Access & application

### Routes & CTA map

| Route | Role |
|---|---|
| `/apply` | Public 3-step application (primary CTA everywhere “Become an investor” lived) |
| `/sign-up` | **Redirect → `/apply`** |
| `/sign-in` | Restyled like `portal.html` |
| `/set-password` | Consumes invite/reset token; sets password; redirects to `/sign-in` |
| `/onboarding`, `/portal/*`, `/admin/*` | Kept; gates updated |

**Header / footer CTAs:** “Create account” / “Become an investor” → `/apply`. Primary marketing CTA may remain “View opportunities”; secondary “Apply” / “Request access”.

### Application wizard

**Chrome:** step dots from `register.html`; account-type cards from 21 VH; Parkwise tokens.

| Step | Content |
|---|---|
| 1 | Account type: Individual (badge “Most common”) / Company |
| 2 | Details (see fields) + investment profile + accept Terms + Risk |
| 3 | Confirmation copy + honest trust chips |

**Step 2 fields**

| Field | Individual | Company |
|---|---|---|
| First / last name | required | required (authorised contact) |
| Email | required (login identity) | required (login identity) |
| Phone | required | required |
| Country of residence | required | required |
| Company legal name | — | required |
| Country of incorporation | — | required |
| Ticket band | optional select (e.g. €5–25k / €25–100k / €100k+) | same |
| Goals note | optional, max 500 chars | same |
| Terms + Risk | required checkboxes with links | same |

**Trust chips:** “Encrypted in transit” · “Reviewed by a human” · “Capital at risk — read Risk Disclosure”  
**Do not** claim AMF, bank-grade custody, or guaranteed returns.

**Rate limits:** per IP and per email (e.g. 5 submits / hour). Soft CAPTCHA optional later.

### Duplicate / re-apply rules

| Existing state | On new `/apply` with same email |
|---|---|
| `pending_access` + application `submitted`/`contacted` | **Idempotent no-op**: return success (“We already have your application”) **without mutating anything** — the unauthenticated form must not let anyone who knows the email overwrite pending PII or re-stamp consent timestamps (anti-PII-overwrite) |
| `pending_access` + `rejected` | Allow **new** application row (or reopen) — ops sees history |
| `active` (+ auth user) | Block apply; “You already have access — sign in” |
| `suspended` | Block apply; “Contact support” |

**DB:** `investors.email` unique (case-insensitive). `authUserId` **nullable unique**. Migration: existing rows remain `active`.

### Schema (access)

**`account_status` enum:** add `pending_access` (keep `active`, `suspended`).

**`investor_applications`**
- `id`, `investorId` (FK)
- `accountType`: `individual` | `company`
- Snapshot fields (denormalised for audit): names, email, phone, countries, company block jsonb
- `investmentProfile` jsonb
- `termsAcceptedAt`, `riskAcceptedAt`
- `status`: `submitted` | `contacted` | `approved` | `rejected`
- `opsNote` text nullable
- `leadId` nullable FK
- `createdAt`, `updatedAt`

**On first submit**
1. Insert investor (`pending_access`, `authUserId=null`, onboarding `started`, store profile fields)
2. Insert application `submitted`
3. Create lead (list: “Inbound applications” or default inbound list) linked via `investorId` / email
4. Audit `application.submitted`

**Terms note:** Accepting Terms/Risk on apply records timestamps on the **application** (and may copy onto investor). **Onboarding questionnaire** remains required after unlock (eligibility Q&A ≠ legal accept).

### Sign-in UX (`portal.html`)

- Cream page, centered card, brand mark, “Welcome back.”
- Email + password + primary block CTA
- Meta: “New to Parkwise? **Apply**” · “Forgot password?” (active users only)
- Errors: invalid credentials (generic); if email has `pending_access` and no auth user → “Your application is under review”
- `DEMO_MODE=true`: optional staging hint for seeded **active** demo user only — never “any password works”

### Ops unlock (Approve & invite)

**Who:** `requireStaff` with investor visibility (super_admin always; agents only if assigned).

**Action: Approve & invite**
1. Guard: application not already approved; investor `pending_access`
2. Create Better Auth user for application email (invite / reset-token flow — no usable password until set)
3. Set `investors.authUserId`, `accountStatus=active`, application `approved`
4. Create **single-use set-password token**, TTL **72h** (configurable)
5. Persist last invite URL for admin UI; skip-log email body with same URL
6. Audit `investor.invited`

**Regenerate invite:** allowed if token expired or unused; invalidates previous token.

**Reject:** application `rejected` + ops note; no auth user; audit.

**Contacted:** set application `contacted` when first outbound call logged on linked lead (or manual toggle).

### Bootstrap exception (critical)

When public signup is locked, **first ops user** still needs a path:

1. Prefer: env `SUPER_ADMIN_EMAILS` + **one-time** `ALLOW_BOOTSTRAP_SIGNUP=true` (documented in SETUP), **or**
2. CLI/script `npm run auth:bootstrap-admin` creating Better Auth user + `staff_profiles`

SETUP must document bootstrap **before** exposing `/apply` publicly. Do not leave a permanent open `/sign-up`.

---

## Part B — KYC (post-approval, dashboard only)

### When / where

| Phase | KYC? |
|---|---|
| Public `/apply` | **No** — never ask for documents here |
| Pending access (pre-invite) | **No** — no portal yet |
| After ops Approve & invite + password + sign-in | **Yes** — `/portal/kyc` in the dashboard shell |

Investors may complete onboarding and **express interest** before finishing KYC. Ops **cannot confirm** an interest into a holding until KYC is `approved`. Portal prompts (banner on Interests / Overview) if they have pending interests and KYC is not yet approved.

### Status on investor

`kycStatus`: `not_started` | `submitted` | `under_review` | `approved` | `rejected`  
(Default `not_started`. Approving from `submitted` allowed; `under_review` optional.)

### Documents

- `document_owner_type` += `investor` (`ownerId` = investor id)
- Categories: `kyc_id`, `kyc_address`, `kyc_company`, `kyc_other`
- Limits: PDF/JPEG/PNG; **10 MB**/file; max **10** files per investor v1
- Storage: existing vault; path prefix `kyc/{investorId}/…`
- Virus scanning: out of scope v1; never serve as executable

### Minimum pack

| Account type | Required before `submitted` |
|---|---|
| Individual | ≥1 `kyc_id` + ≥1 `kyc_address` |
| Company | ≥1 `kyc_id` (authorised person) + ≥1 `kyc_company` + ≥1 `kyc_address` |

Investor marks “Submit for review” only when minimum met → `kycStatus=submitted`.

### Reject / resubmit

- Ops reject → `rejected` + reason shown in portal  
- Investor may upload replacements and resubmit → `submitted` again  
- Prior files retained for audit

### Gate matrix

| Action | Account | Onboarding | KYC |
|---|---|---|---|
| Sign in / portal / dashboard | `active` + auth user | — | — |
| Complete onboarding | `active` | in progress | — |
| Open `/portal/kyc` + upload | `active` (post-approval) | — | — |
| Submit KYC for review | `active` | recommended complete (soft); **hard: account active** | minimum pack |
| Express interest | `active` | **complete** | **not required** |
| Ops **confirm** interest → holding | investor `active` | complete | **`approved` only** |
| Withdraw pending interest | `active` | — | — |

If KYC is `rejected` or not yet `approved` while interest is still `pending`, confirm remains blocked; investor keeps using the dashboard to finish KYC.

### Admin KYC UX

- List files + download  
- Approve pack / Reject with note  
- Agent scoping preserved  

### Honesty copy

Portal KYC page: “Upload the documents our team needs to review your account. Handling follows our Privacy Notice and Terms.”

---

## Part C — Portal / dashboard merge

### Shell

- Dark sidebar from `dashboard.html`: Overview, Interests, Holdings, Documents, KYC, Settings, Back to site, Sign out  
- Hide marketing chrome inside `/portal/*` (same pattern as `/admin`)  
- Mobile: drawer; focus trap; no horizontal scroll  

### Route map

| Nav | Route | Content |
|---|---|---|
| Overview | `/portal` | Greeting + KPI grid + holdings snapshot + CTA to opportunities |
| Interests | `/portal/interests` | **Existing** interest list + withdraw — do not drop |
| Holdings | `/portal/holdings` | Existing |
| Documents | `/portal/documents` | Existing vault (non-KYC) |
| KYC | `/portal/kyc` | Upload + status |
| Settings | `/portal/settings` | Read-only profile from investor/application; “Contact your advisor to change” |

Dedicated `/portal/interests` keeps Overview KPI-first (dashboard.html spirit) without losing current interests UX.

### KPIs (honest)

From **confirmed holdings** only:

| KPI | Definition |
|---|---|
| Capital invested | Sum `holdings.amountEur` active |
| Target monthly income | Sum amount × (targetYieldPct/100) / 12 — label **Contractual target** |
| Holdings | Count + distinct operators |
| Next payout | Empty state until real schedule exists; **or** illustrative “1st of month” with Demo badge when `DEMO_MODE=true` |

**Chart:** illustrative 12-month series from target monthly (flat); disclaimer under chart.  
**Never** show “Paid” history unless `DEMO_MODE` and explicitly labeled Demo.

---

## Part D — Marketing & catalogue UX (HTML harvest)

### Priority

**P0 (ship with this program)**  
- `/sign-in` portal-card  
- `/apply` wizard chrome  
- Asset card **schematic** header (`artVariant`)  
- How-it-works **Simulator**  
- Why-parking + About **primary SVG** illustrations + CTA-band art  
- Home hero visual restoration (illustration/blob) if currently text-only  
- Mobile overflow fixes (header, filters, apply, dash)  
- Global CTA retarget → Apply  

**P1 (same milestone if time; else follow-up)**  
- Home FAQ accordion / “footnotes” block  
- Opportunities “pick your profile” tier explainer  
- Documents library visual grouping + CTA art  
- Testimonials / quote styles from about  
- Home featured asset strip using live catalogue  

### Asset cards

- Schematic bay SVG by `artVariant`  
- Keep mobility badges, operator, spaces, yield, from, disclaimer  
- Dense tags: prefer short labels on cards  

### Simulator

- Capital + term + yield (default mid illustrative %; optional select)  
- Monthly / annual / total  
- Disclaimer identical in spirit to HTML `sim-disclaimer`  
- Client-only; no persistence  

### Sign-in

As Part A; primary CTA is Sign in; secondary is Apply (not open signup).

---

## Part E — Admin & ops

- Investors list filters: account status, application status, KYC status  
- Queue view: “Pending applications”  
- Detail tabs: Profile · Application · KYC · Interests · Access events  
- Actions: Contacted, Approve & invite (+ regenerate), Reject, KYC approve/reject  
- Confirm interest: server-side KYC=`approved` check (UI disable + hard error)  
- Agent scope unchanged  

---

## Security & privacy checklist

- No password on apply  
- Invite token: single-use, TTL, hashed at rest if stored  
- Admin invite URL is sensitive — authorised staff only  
- KYC files: investor + scoped staff only; not in public documents library  
- Rate-limit apply + KYC upload  
- PII retention: SETUP note — wipe applications/KYC with demo reset scripts  
- `SIGNUPS_DISABLED=true` default for compose/staging after bootstrap  

---

## Success criteria

1. Public cannot create an immediately usable login via `/sign-up`  
2. `/apply` creates pending investor + application + lead; duplicates handled per table  
3. Ops invite → set password → sign-in → onboarding → KYC → interest works  
4. Confirm interest blocked without KYC `approved`; express interest allowed before KYC  
5. Portal dash shell; interests/holdings/docs retained  
6. P0 HTML harvest shipped (sign-in, apply, cards, simulator, key SVGs, mobile)  
7. No fake regulatory badges; disclaimers on simulator, KPIs, mix, partners  
8. Bootstrap path documented and tested  
9. Tests: apply idempotency, status gates, KYC minimum, confirm blocked without KYC, invite TTL helper  

## Implementation phases

1. Schema + migrations + gate helpers + tests  
2. `/apply` + CTA rewires + `/sign-in` restyle + signup lock + bootstrap docs  
3. Ops unlock + set-password + admin invite UI  
4. KYC upload + admin review + interest/confirm gates  
5. Portal dash shell + `/portal/interests` split  
6. P0 marketing graphics + schematic cards + simulator  
7. Mobile QA + verify checklist (`apps/web/docs/plan-apply-first-ux-verify.md`)  

## Defaults locked by this rev

| Topic | Default |
|---|---|
| Settings | Read-only profile + contact advisor |
| Interests URL | `/portal/interests` |
| Invite TTL | 72 hours |
| KYC timing | After ops approval, in dashboard only (not on apply) |
| KYC submit-for-review | Account `active`; onboarding complete preferred (soft) |
| Express interest KYC bar | **None** (onboarding complete only) |
| Confirm → holding KYC bar | `approved` only |
| SMTP | Skip-log + admin URL v1 |
| HTML P1 items | Follow-up OK if P0 green |

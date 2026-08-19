# Apply-first access — Implementation Plan

> **For agentic workers:** Implement task-by-task. Spec: `docs/superpowers/specs/2026-07-19-apply-first-ux-design.md`

**Goal:** Replace public self-serve signup with apply → pending → ops invite → set-password → portal, plus post-approval KYC gate on confirm→holding.

**Architecture:** Nullable `investors.authUserId` + `pending_access`; `investor_applications` table; invite tokens; `/apply` wizard; admin Approve & invite; `/set-password`; `/portal/kyc`; confirmInterest requires `kycStatus=approved`.

**Tech Stack:** Next.js 15, Drizzle/Postgres, Better Auth, existing leads CRM.

## Global Constraints

- No KYC on public `/apply`
- Interest without KYC OK; confirm requires KYC approved
- Skip-log email + admin-copyable invite URL
- Bootstrap path for SUPER_ADMIN when signup locked
- Existing active investors unchanged

## Tasks

- [x] 1. Schema + migration 0011 (pending_access, applications, kyc, invites)
- [x] 2. `submitApplication` server action + rate limit + tests
- [x] 3. `/apply` 3-step UI; `/sign-up` → redirect
- [x] 4. Admin Approve & invite + reject + invite URL display
- [x] 5. `/set-password` + sign-in pending copy
- [x] 6. `/portal/kyc` upload + submit; confirmInterest KYC gate
- [x] 7. Header/footer CTAs → `/apply`; INVITE_SLA on confirmation
- [x] 8. Vitest + migrate/seed smoke

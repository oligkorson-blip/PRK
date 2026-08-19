# CPO ops + portal fix-all — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the CPO admin/portal backlog (P0–P2) so ops can clear money-lane gates with preflight + agreements, and investors always see progress + next action.

**Architecture:** Pure helpers (timeline, preflight, role home, doc packs) + server actions wrapping existing services; one migration for `contracts.interest_id`; UI wired into existing admin/portal pages.

**Tech Stack:** Next.js 15 App Router, Drizzle/Postgres, vitest, existing Better Auth staff sessions.

## Global Constraints

- Consumer copy: no “hubs”, no advisory language; keep capital-at-risk on yield surfaces.
- Server actions: `{ ok: true/false }`; authz inside; staff scoping via `investorVisibleToStaff`.
- Demo mode only via `lib/demo-mode.ts`.
- Never edit applied migrations; generate `0034` for interest link.
- Run JS from `apps/web`; Node 22 via nvm PATH.

---

## File map

| Area | Create / modify |
|---|---|
| Timeline | `lib/portal/access-timeline.ts` + test; `app/portal/page.tsx` |
| Interest stages | `lib/portal/interest-request-stages.ts` + test; portal interests page |
| Preflight | `lib/interests/confirm-preflight.ts` + test; queries; admin interest actions |
| Agreements | `lib/contracts/persistence.ts`; migration 0034; `lib/contracts/admin-create.ts`; admin UI |
| Four-eyes / attention | `lib/interests/queries.ts`; `lib/admin/dashboard.ts`; admin page + interests filter |
| Lead convert | `lib/leads/convert-actions.ts` + lead detail UI |
| Batch distributions | `lib/portfolio/admin-distributions.ts`; batch form component |
| Role homes | `lib/admin/role-home.ts` + test; admin page |
| Doc packs | `lib/portal/document-pack-guidance.ts` + test; portal documents |
| Copy | `lib/copy/consumer.ts` |
| Staff 2FA | `lib/auth/staff-two-factor.ts` + admin layout gate |

---

### Task 1: Progress spine + interest stages

- [ ] Extend `buildAccessTimeline` with optional `openAgreements` / `awaitingAgreement` and keep investments/agreements steps useful when funded
- [ ] Tests for agreements step + funded next action
- [ ] Show compact progress + next action on funded portal overview
- [ ] Add factual request-status stages on portal interests cards
- [ ] Centralize related copy in `consumer.ts`

### Task 2: Confirm preflight

- [ ] Pure `evaluateConfirmPreflight` + async loader
- [ ] Wire checklist into `AdminInterestActions`; disable Confirm on blockers
- [ ] Batch-load preflight on interests list where practical

### Task 3: Create agreement from interest

- [ ] Schema + migration `interest_id`
- [ ] `createAgreementFromInterest` server action (super_admin)
- [ ] Admin UI on interests (confirmed without agreement) and contracts empty CTA

### Task 4: Attention + four-eyes inbox

- [ ] Counts for pending four-eyes + confirmed-without-agreement
- [ ] Dashboard attention items + `?filter=four-eyes`

### Task 5: Lead convert + distribution batch

- [ ] Convert lead → create investor/application → invite
- [ ] `recordDistributionBatch` + UI

### Task 6: Role homes, doc packs, staff 2FA, platform checklist note

- [ ] Role home helper + admin page
- [ ] Document pack guidance on portal documents
- [ ] Staff 2FA required when `!isDemoMode()`
- [ ] Platform settings: link to PRODUCTION_CHECKLIST / go-live expectations

### Task 7: Verify

- [ ] `npx tsc --noEmit` and targeted vitest
- [ ] Commit, push, PR

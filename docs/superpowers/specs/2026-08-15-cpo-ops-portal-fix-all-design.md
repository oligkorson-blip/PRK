# CPO ops + portal fix-all — design

Approved via product request “fix all” against the CPO review of admin/portal.

## Principle

Admin clears gates and leaves an audit trail. Portal shows progress and the next concrete action. No shortlist/compare. Consumer copy stays non-advisory.

## Scope

### P0 — money lane

1. **Investor progress spine** — Keep `buildAccessTimeline` on overview for empty *and* funded accounts; add an Agreements step; show a factual request-status timeline on each portal interest.
2. **Confirm preflight** — Structured readiness checklist (KYC, AML clear, account active, pool access, asset open, capacity, four-eyes) before Confirm; Confirm disabled until hard blockers clear.
3. **Create agreement from interest** — Super-admin action wrapping `createContract`, linked via nullable unique `contracts.interest_id`; available for confirmed interests without an agreement.

### P1 — ops speed

4. **Attention queues** — Extend `/admin` Needs attention with four-eyes pending and confirmed-without-agreement counts; keep zero-count queues hidden.
5. **Four-eyes inbox** — `/admin/interests?filter=four-eyes` (and dashboard deep link).
6. **Lead → investor** — Staff action on a lead: create/link investor + application + invite (reuses invite machinery).
7. **Distribution batching** — Same period/type/status applied to multiple holdings in one submit (per-row amount); four-eyes still per distribution.

### P2 — polish / scale

8. **Role homes** — Role-specific title/subtitle and primary work links on `/admin` (agent / IB / super_admin).
9. **Document packs by stage** — Portal documents empty-state guidance by KYC/interest/holding stage (copy + links; no new vault schema).
10. **Post-invite portal copy** — Centralize getting-started / waiting / agreements empty strings in `lib/copy/consumer.ts`.
11. **Staff 2FA when not demo** — When `!isDemoMode()`, staff without 2FA are redirected to enroll (except the enroll route itself).

## Non-goals

- In-app messaging product
- Shortlist / compare
- Changing confirm→holding semantics
- Editing applied migrations

## Architecture notes

- Pure helpers for timeline/preflight/role-home/doc-pack stage (unit-tested).
- Server actions return `{ ok: true/false }`; authz inside actions; staff scoping unchanged.
- Demo mode only via `lib/demo-mode.ts`.
- Migration `0034` adds `contracts.interest_id` (nullable unique FK).

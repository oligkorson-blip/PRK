# Plan 2 verification

Verified locally on branch `feature/platform-plan2` (HEAD `f6813bb`), Node v22.23.1. Re-verify on the one-server branch with Better Auth + local Postgres; transactional email always skip-logs (Resend not used).

- [x] `npm test` passes — `vitest run` in `apps/web`: 8 files, 36 tests passed.
- [x] `npm run build` passes — `next build` in `apps/web` completed successfully (17 routes generated).
- [x] Incomplete onboarding redirects from `/portal` to `/onboarding` — confirmed in code: `app/portal/page.tsx` calls `isOnboardingComplete(investor)` and `redirect("/onboarding")` when false; gate logic covered by `tests/gates.test.ts`.
- [ ] Completed onboarding can submit interest ≥ min ticket — **blocked**: requires signed-in session, `DATABASE_URL`, migrate + seed, and completed onboarding row; amount validation logic verified in `tests/interest-validation.test.ts` (`validateInterestAmount` accepts exact minimum).
- [x] Second pending interest on same asset rejected — confirmed in code: `lib/interests/actions.ts` `createInterest` queries for existing `pending` interest on same asset/investor and returns error `"You already have a pending interest in this opportunity."`
- [x] Portal shows pending interest — confirmed in code: `app/portal/page.tsx` lists interests with status badges and renders `WithdrawInterestButton` when `status === "pending"`.
- [ ] Admin confirm creates holding and emails (or skip-log) — **blocked**: requires admin session + DB with pending interest; confirmed in code: `lib/interests/admin-actions.ts` `confirmInterest` updates status, inserts `holdings` row, writes audit event, and calls `sendTransactionalEmail` (which logs `[email:skip]` — Resend not used).
- [ ] Admin decline updates status — **blocked**: requires admin session + pending interest in DB; confirmed in code: `lib/interests/admin-actions.ts` `declineInterest` sets status `declined`, audit event, and optional email.
- [ ] Investor can withdraw pending interest — **blocked**: requires signed-in investor with pending interest; confirmed in code: `lib/interests/actions.ts` `withdrawInterest` + `WithdrawInterestButton`; transition rules in `tests/interest-transitions.test.ts` (`pending` → `withdrawn` allowed).
- [x] Yield copy never says guaranteed — confirmed in code: marketing, asset cards, detail pages, onboarding checkbox, emails, and legal pages use negated phrasing only (e.g. "never guaranteed", "not a guarantee", "contractual targets, not guarantees"); no affirmative guaranteed-yield claims found.

## Blocked items — how to complete

Populate `apps/web/.env.local` with `DATABASE_URL`, Better Auth vars, `ADMIN_EMAILS`, and `OPS_INBOX_EMAIL`. See `SETUP.md`.

From `apps/web`:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

1. Sign in as investor with incomplete onboarding → visit `/portal` → expect redirect to `/onboarding`.
2. Complete onboarding (questionnaire + T&Cs + risk acceptance) → express interest on an asset at or above min ticket → expect success.
3. Submit a second pending interest on the same asset → expect rejection.
4. Visit `/portal` → pending interest visible with withdraw button.
5. Sign in as an email listed in `ADMIN_EMAILS` → `/admin/interests` → confirm one interest → holding created; check server log for `[email:skip]`.
6. Decline another interest → status updates; investor sees declined in portal.
7. Withdraw a pending interest → status becomes withdrawn.

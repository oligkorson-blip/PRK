# Plan 1 verification

Verified locally on branch `feature/platform-plan1` (HEAD `a5aee40`), Node v22.23.1. Re-verify on the one-server branch with Better Auth + local Postgres (Clerk not used).

- [x] `npm test` passes — `vitest run` in `apps/web`: 3 files, 4 tests passed.
- [x] `npm run build` passes — `next build` in `apps/web` completed successfully (11/11 static/dynamic routes generated).
- [x] `/api/health` returns ok — `next dev` with `DEMO_MODE=true`, `curl http://localhost:3000/api/health` → `{"ok":true}`.
- [x] Banner shown in demo mode — homepage HTML includes `Demonstration environment — not live offerings.` banner from `components/demo-banner.tsx` (verified with `DEMO_MODE=true`). The banner is fail-safe: it shows for any `DEMO_MODE` value except `false`/`0` (case-insensitive, after trimming), including unset.
- [ ] Sign-up → `/portal` creates investor row — **blocked**: needs Better Auth env + `DATABASE_URL` in `.env.local`; investor row is created via `ensureInvestor` on first authenticated visit.
- [ ] Non-admin `/admin` redirects — **blocked**: requires a signed-in session whose email is not in `ADMIN_EMAILS`.
- [ ] Admin access allows `/admin` — **blocked**: requires a signed-in session whose email is listed in `ADMIN_EMAILS`.
- [ ] `/opportunities` lists seeded published assets — **blocked**: requires `DATABASE_URL` + `npm run db:migrate` + `npm run db:seed`; without it the route 500s (confirmed via `curl http://localhost:3000/opportunities` → HTTP 500, as expected for a DB-backed `force-dynamic` route with no database configured).
- [x] Asset detail shows target yield disclaimer — confirmed in code: `app/opportunities/[slug]/page.tsx` renders "Capital at risk. Target yields are contractual, never guaranteed." in the detail sidebar (same disclaimer also present as "Contractual target, not a guarantee." on `components/asset-card.tsx`). Not exercised live because it depends on the seeded DB above.
- [x] Root static demo still serves via `python3 -m http.server` — `python3 -m http.server 8765` from repo root, `curl http://127.0.0.1:8765/opportunities.html` → HTTP 200.

## Blocked items — how to complete

To finish the unchecked items, populate `apps/web/.env.local` with Better Auth vars and `DATABASE_URL` (see `SETUP.md`).

Then run, from `apps/web`:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

- Visit `/sign-up`, complete email/password sign-up, confirm redirect to `/portal` and an investor row created (check via Drizzle Studio or a DB client).
- Sign in as a non-admin investor and visit `/admin` — expect redirect.
- Add the user's email to `ADMIN_EMAILS`, restart, revisit `/admin` — expect access.
- Visit `/opportunities` and confirm seeded assets from `js/data.js` appear.

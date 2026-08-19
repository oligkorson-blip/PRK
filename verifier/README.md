# Verifier index — Parkwise "best in market design" goal

Acceptance criteria live in versioned folders. Each run is recorded under `runs/`.

## v1 — created 2026-07-21

**File:** `v1/criteria.md`
**Measures:**
1. **Layout integrity** — zero horizontal overflow on every audited page
   (Playwright, `scrollWidth - clientWidth === 0`). Public pages are audited at
   320, 360, 390, 768, 1024, 1440, 1920 px widths; the authenticated pages
   (opportunities, opp detail, portal, portal/holdings, admin, admin leads)
   are audited at 390 and 1440 px only.
2. **Console health** — zero page errors / console errors on all audited pages.
3. **Touch targets** — all interactive elements ≥ 40px effective height (checkboxes via enclosing label/row).
4. **Contrast** — body text and key UI text ≥ WCAG AA (4.5:1 normal, 3:1 large) via computed styles on sampled elements (dark-section aware).
5. **Art direction coherence** — generated brand imagery present on home hero,
   opportunities header, and CTA sections; no broken images; all images load (naturalWidth > 0),
   with lazy-load and viewport-hidden (display:none) images handled correctly.
6. **Build health** — `tsc --noEmit` clean, `vitest` 100% pass, `next build` 42/42 pages.
7. **Responsive completeness** — audited page set: home, how-it-works, why-parking,
   fees, faq, guides, apply, contact, about (anonymous); opportunities, opp detail,
   portal, portal/holdings (investor persona — the catalogue is members-only);
   admin home, admin leads (ops persona).

**Method:** `v1/check.cjs` (Playwright) + build/test commands. Run records appended to `runs/`.
The script resolves the app at `../../apps/web` and drives its bundled Chromium via
`apps/web/node_modules/playwright-core` (run `npm install` in `apps/web` first, and
have the app running on `http://localhost:3000`). Auth pages are audited in a separate
browser context per persona; emails default to `investor@example.com` and
`ops@parkwise.eu`, and can be overridden via
`VERIFIER_INVESTOR_EMAIL` / `VERIFIER_INVESTOR_PASSWORD` / `VERIFIER_OPS_EMAIL` /
`VERIFIER_OPS_PASSWORD`. The passwords are whatever was passed as
`TEST_USER_PASSWORD` to `apps/web/scripts/create-test-users.ts` when the accounts
were created — no password is hardcoded anywhere; always supply the persona
passwords via the env vars above. A sign-in that does not reach the persona's
landing page fails the run.

**Latest:** no passing run on record. The files under `runs/` are empty
placeholders (`[]`); the earlier ALL-PASS claim was removed because no recorded
evidence backs it. Re-run `v1/check.cjs` + build/test commands to produce a
real record before claiming a pass.

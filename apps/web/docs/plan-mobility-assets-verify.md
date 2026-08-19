# Mobility infrastructure assets — verification

Manual checks after pulling the mobility-assets branch: `income_mix` column, 24+ hub seed, catalogue filters/badges, detail mix panel, partners disclaimer, and admin read-only summary.

## Prerequisites

1. From `apps/web`, configure `.env.local` (see `docs/SETUP.md`).
2. After pull: `npm run db:migrate` then `npm run db:seed` (order matters).
3. Seed **requires** valid `incomeMix` on every row; it **deletes** `interests` / `holdings` for removed asset slugs before dropping those assets.

## Automated tests

- [ ] From `apps/web`: `npm test -- --run` passes, including `tests/income-streams.test.ts` (taxonomy validation, parking-primary rules, helpers).

## Catalogue and seed

- [ ] Seed log shows **≥24** assets (current seed JSON has 27 hubs).
- [ ] `/opportunities` lists published hubs with operator, city, and target yield.
- [ ] Cards show ancillary badges when mix includes non-parking streams (EV, bikes, etc.).
- [ ] Filters work: operator, EV-capable, multi-income (and clear/reset as expected).

## Mix validation (data)

- [ ] Every seeded asset has `income_mix` with `vehicle_parking` present and parking pct ≥ any other stream.
- [ ] Percentages on each asset sum to 100; unknown stream ids are rejected by seed validation (re-seed fails loudly if JSON is invalid).

## Asset detail

- [ ] `/opportunities/[slug]` shows the income mix panel (bars/labels for each stream).
- [ ] Canonical demo disclaimer appears near yields / mix (illustrative targets, capital at risk).

## Marketing / partners

- [ ] Home / why-parking / how-it-works reflect mobility-infrastructure thesis (parking-primary).
- [ ] About (or partners section) lists six illustrative operators with the partners disclaimer (not endorsements).

## Admin

- [ ] `/admin/assets` shows a read-only income-mix summary (no mix editor).
- [ ] Mix matches the public detail for a spot-checked slug.

## Demo wipe reminder

- [ ] After re-seed with a smaller/different slug set, confirm old interests/holdings for removed slugs are gone (expected wipe — see `docs/SETUP.md` §3).

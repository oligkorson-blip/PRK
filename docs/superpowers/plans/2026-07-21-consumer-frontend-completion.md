# Parkwise consumer frontend completion — Phase 0 plan

> Date: 2026-07-21 · Status: phases 0–14 implemented (uncommitted)

## Confirmed stack

- Next.js 15 / React 19 / App Router · `apps/web`
- Global CSS ~3769 lines (`app/globals.css`) · no Tailwind
- Manrope + Fraunces via `next/font`
- Copy: `lib/copy/consumer.ts`, `lib/copy/posture.ts`
- Tests: Vitest unit + Playwright smoke · no axe dependency yet

## Exact paths (verified)

| Area | Path |
|------|------|
| Card | `components/asset-card.tsx` |
| Catalogue | `app/opportunities/opportunities-catalogue.tsx` |
| Detail | `components/opportunity-detail-client.tsx` + `app/opportunities/[slug]/page.tsx` |
| Simulator | `components/income-simulator.tsx` |
| Apply | `components/apply-wizard.tsx` |
| Header/Footer | `components/site-header.tsx`, `components/site-footer.tsx` |
| Home | `app/page.tsx` |
| Formatters | `lib/format.ts` |
| Funding | `lib/assets/funding.ts` |
| Asset query | `lib/assets.ts` |
| Schema | `lib/db/schema.ts` (`asset_status`: draft \| published \| closed) |

## Data sources

- **Canonical asset row:** DB `assets` (+ `investmentOptions`, `commercialTermIds`, `leaseLabel`, `advisoryCapacityEur`)
- **Funding:** holdings sum vs capacity → `FundingSnapshot` (`open` / Full)
- **Consumer status (derived, not a separate enum):** published+open → Open; published+!open → Fully funded; closed → Closed; anything else → Unavailable
- **No payment-frequency column:** derive Monthly from `contractual_monthly_rent` term, else approved fallback
- **Term:** `leaseLabel` (card currently hardcodes `5–10 yrs`)

## Component relationships

```
listPublishedAssets / getPublishedAssetBySlug
  → fundingForAssets
  → presentation contract (new)
  → AssetCard | OpportunityDetailClient | Catalogue
```

## Confirmed defects vs brief

1. Card hardcodes term + Monthly; detail uses `leaseLabel` — **Phase 1**
2. Missing funding defaults to Open — **Phase 1/2**
3. Scroll-gated CTA (`termsSeen` IntersectionObserver) — **Phase 7**
4. CTA “Create account to invest” — **Phase 7/8**
5. Catalogue: no pagination/URL state — **Phase 6**
6. Home hero `min(84vh)` — **Phase 4/10**
7. Simulator yield buttons lack radiogroup/aria-pressed — **Phase 3**
8. Home vs HIW step arrays diverge — **Phase 8**
9. Footer 4–5 cols + Team→About — **Phase 13**
10. Header always “View opportunities” when signed out — **Phase 12**

## Conflicts with brief

- Brief lists Coming soon / Paused / Matured — **not in product**; only Open / Fully funded / Closed / Unavailable
- Payment frequency field missing — use term derivation + fallbacks, do not invent DB columns unless required
- Portal “Browse opportunities” copy — avoid portal edits unless shared regression

## Sequence

1 → 2 → 5 (card uses presentation+status) → 6 → 7 → 3 (forms/sim can parallel after 1) → 4 → 8 → 9 → 10 → 11 → 12 → 13 → 14 · tests continuously

## Risks

- Funding `open` vs asset `closed` dual signals — status mapper must prefer asset.status=closed
- Global CSS hero/card edits can regress portal/admin — scope selectors
- URL pagination needs `useSearchParams` + Suspense on catalogue page

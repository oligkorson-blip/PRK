# Help Me Choose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/help-me-choose` — a calm, skippable four-step preference flow that returns ≤3 explained open opportunities without advisory claims.

**Architecture:** Pure matcher over published open assets; server page loads assets; client one-question wizard; compose `AssetCard` + why wrapper; public-brand CSS.

**Tech Stack:** Next.js 15 App Router, vitest, existing catalogue helpers (`catalogueMinBasis`, `matchesMinBand`, `normalizeSiteType`, presentation status).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-help-me-choose-design.md` (Approved, post-review locks).
- Non-advisory: no “best for you”, “recommended”, “suitable”, “safer”, “lower risk”.
- Pool: published + opportunity status **`open`** only.
- Hard: budget + place; soft: term (midpoint) + figures; Skip clears answer.
- No “any” place option; Drop place once if hard filters empty (`relaxedPlace`).
- Disclaimer: `CHOOSER_ILLUSTRATIVE_DISCLAIMER` (no apostrophes) + non-recommendation line.
- Homepage entry = ghost/text only — must not rival primary Explore CTA.
- Do not fork `AssetCard`; wrap it.
- Run from `apps/web` with Node 22 on PATH.
- Commit when executing this plan as authorized work.

## File map

| File | Responsibility |
|------|----------------|
| `lib/copy/consumer.ts` (+ test) | `CHOOSER_ILLUSTRATIVE_DISCLAIMER` + chooser non-rec line |
| `lib/assets/help-me-choose.ts` | Pure matcher + lease parse + why builders |
| `lib/assets/help-me-choose.test.ts` | Matcher contracts |
| `components/help-me-choose-wizard.tsx` | Client one-question UI + results |
| `components/help-me-choose-results.tsx` | Card + why wrapper (optional split) |
| `app/help-me-choose/page.tsx` | Server load + metadata |
| `app/page.tsx` | Ghost/text entry near Explore |
| `app/opportunities/page.tsx` | Intro link |
| `app/sitemap.ts` | Add `/help-me-choose` |
| `app/globals.css` | `.help-choose-*` styles |
| `tests/help-me-choose-wizard.test.tsx` | Markup/flow smoke via renderToStaticMarkup or RTL |

---

### Task 1: Copy constants (TDD)

**Files:**
- Modify: `apps/web/lib/copy/consumer.ts`
- Modify: `apps/web/lib/copy/consumer.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import {
  CHOOSER_ILLUSTRATIVE_DISCLAIMER,
  CHOOSER_NON_ADVISORY_LINE
} from "@/lib/copy/consumer";

it("exposes chooser disclaimer without apostrophes", () => {
  expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER).toContain("illustrative");
  expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER).toContain("not a live investment offering");
  expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER).toContain("Capital at risk");
  expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER).not.toContain("'");
  expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER.toLowerCase()).not.toContain("guide is");
});

it("states matches are not personal recommendations", () => {
  expect(CHOOSER_NON_ADVISORY_LINE.toLowerCase()).toMatch(/not a personal recommendation|not personal advice|preference/);
  expect(CHOOSER_NON_ADVISORY_LINE).not.toContain("'");
  expect(CHOOSER_NON_ADVISORY_LINE.toLowerCase()).not.toMatch(/suitable|best for you|recommended for you/);
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd apps/web
npx vitest run lib/copy/consumer.test.ts
```

- [ ] **Step 3: Implement**

```ts
export const CHOOSER_ILLUSTRATIVE_DISCLAIMER =
  "This tool is illustrative and not a live investment offering. Figures are examples only. Capital at risk.";

export const CHOOSER_NON_ADVISORY_LINE =
  "Matches reflect the preferences you explored. They are not a personal recommendation.";
```

- [ ] **Step 4: Run — PASS; commit**

```bash
npx vitest run lib/copy/consumer.test.ts
git add apps/web/lib/copy/consumer.ts apps/web/lib/copy/consumer.test.ts
git commit -m "feat(web): add Help Me Choose disclaimer copy"
```

---

### Task 2: Matcher module (TDD)

**Files:**
- Create: `apps/web/lib/assets/help-me-choose.ts`
- Create: `apps/web/lib/assets/help-me-choose.test.ts`

**Interfaces:**

```ts
export type ChooserBudget = "under10" | "10to25" | "over25";
export type ChooserPlace = "airport" | "station" | "city" | "retail";
export type ChooserTerm = "le11" | "eq12" | "ge13";
export type ChooserFigures = "simpler" | "mixed";

export type ChooserAnswers = {
  budget: ChooserBudget | null;
  place: ChooserPlace | null;
  term: ChooserTerm | null;
  figures: ChooserFigures | null;
};

export type ChooserAsset = {
  slug: string;
  name: string;
  siteType?: string | null;
  leaseLabel: string;
  minTicketEur: string | number;
  investmentOptions?: InvestmentOption[];
  incomeMix?: IncomeMixEntry[];
  visitorsProvenance?: MetricProvenance;
  revenueProvenance?: MetricProvenance;
  // plus fields needed for AssetCard / open status via presentation input
  [key: string]: unknown;
};

export function parseLeaseYears(leaseLabel: string): number | null;
export function matchHelpMeChoose(
  assets: OpportunityListFields[], // or ChooserAsset[]
  answers: ChooserAnswers
): { results: { asset: OpportunityListFields; reasons: string[] }[]; relaxedPlace: boolean };
```

- [ ] **Step 1: Write failing tests** covering:
  - `parseLeaseYears("12 years") === 12`
  - `parseLeaseYears("10–15 years") === 12.5` (midpoint)
  - `parseLeaseYears("weird") === null`
  - budget hard filter uses `matchesMinBand`
  - place hard filter
  - zero after hard + place set → `relaxedPlace: true` and results without place
  - still zero → empty
  - soft term/figures change order but don’t drop
  - all-null answers → 3 by name asc + starter reason
  - only `open` status assets considered (fixture with fully_funded excluded)
  - reasons omit skipped dimensions; no suitability words in reason strings

- [ ] **Step 2: Run — FAIL**

```bash
npx vitest run lib/assets/help-me-choose.test.ts
```

- [ ] **Step 3: Implement matcher**

Reuse `catalogueMinBasis`, `matchesMinBand`, `normalizeSiteType`, `isMultiIncome` / parking pct, `buildOpportunityPresentation` for open check via `listFieldsToPresentationInput`.

Term bands: `le11` if years ≤ 11; `eq12` if ≥ 11.5 && < 12.5 (or round to nearest for single 12); `ge13` if ≥ 13. Document thresholds next to constants.

- [ ] **Step 4: PASS + commit**

```bash
npx vitest run lib/assets/help-me-choose.test.ts
git add apps/web/lib/assets/help-me-choose.ts apps/web/lib/assets/help-me-choose.test.ts
git commit -m "feat(web): add Help Me Choose preference matcher"
```

---

### Task 3: Wizard UI + page + sitemap + entries

**Files:**
- Create: `apps/web/components/help-me-choose-wizard.tsx`
- Create: `apps/web/app/help-me-choose/page.tsx`
- Modify: `apps/web/app/sitemap.ts`, `apps/web/app/page.tsx`, `apps/web/app/opportunities/page.tsx`
- Create: `apps/web/tests/help-me-choose-wizard.test.tsx`

- [ ] **Step 1: Page shell**

Server component loads `listPublishedAssets()`, maps to list fields + funding if cards need it (follow homepage/catalogue mapping). Pass serializable props to client wizard.

Metadata:

```ts
title: "Help me choose"
description: "Explore a few parking opportunities that match preferences you set. Illustrative academy scenarios — not personal advice."
```

Add `"/help-me-choose"` to `sitemap.ts` `staticPaths`.

- [ ] **Step 2: Wizard client**

State: `step` 0–3 questions or `"results"`; `answers: ChooserAnswers`.

Per step: heading, lead, choice buttons (selected style), Skip / Back / Continue.  
Skip → set that key `null`, step++.  
Continue → require selection, step++.  
After step 4 Continue/Skip → compute `matchHelpMeChoose`, show results.

Results: disclaimer pair; optional relaxed banner; map results to wrapper:

```tsx
<article className="help-choose-result">
  <AssetCard asset={asset} />
  <p className="help-choose-why">{reasons.join(" · ")}</p>
</article>
```

CTAs: Browse all → `/opportunities`; Change answers → step 0.

Focus management: `useEffect` on step → focus `h1` ref.

Reduced motion: CSS class or `matchMedia` to disable transition class.

- [ ] **Step 3: Entry points**

Homepage: next to primary Explore, add  
`<Link className="btn btn-ghost ..." href="/help-me-choose">Help me choose</Link>`  
(or `link-arrow` if ghost is too heavy — must not be `btn-primary`).

Opportunities `PageIntro` / intro: add link-arrow “Help me choose”.

- [ ] **Step 4: Component test**

Static render of wizard with fixture assets: assert Step 1 of 4, Skip present; after forcing results state (export a test helper or render results subview), assert why text and non-advisory line.

- [ ] **Step 5: tsc + vitest + commit**

```bash
npx tsc --noEmit
npx vitest run lib/copy/consumer.test.ts lib/assets/help-me-choose.test.ts tests/help-me-choose-wizard.test.tsx
git add apps/web/app/help-me-choose apps/web/components/help-me-choose-wizard.tsx \
  apps/web/app/sitemap.ts apps/web/app/page.tsx apps/web/app/opportunities/page.tsx \
  apps/web/tests/help-me-choose-wizard.test.tsx
git commit -m "feat(web): ship Help Me Choose guided flow page"
```

---

### Task 4: Visual polish CSS + verify

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add `.help-choose-*` block**

Cream full-viewport stage, centered question column (`max-width` ~36–40rem), large choice buttons (min-height 44px), progress row, results grid, why muted, disclaimer stack. Motion:

```css
@media (prefers-reduced-motion: reduce) {
  .help-choose-stage { transition: none; }
}
```

- [ ] **Step 2: Manual checklist**

- Desktop + ~390px: all 4 steps, skip path, results, change answers, empty/relax if possible
- Homepage: Explore still primary; Help me choose secondary
- `/help-me-choose` in view-source metadata; sitemap includes path

- [ ] **Step 3: Full vitest**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): polish Help Me Choose one-question stages"
```

- [ ] **Step 5: Push when asked**

```bash
git push origin HEAD
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Disclaimer constants | 1 |
| Matcher + midpoint + open pool + relax | 2 |
| Wizard UX + results + entries + sitemap | 3 |
| Visual bar + motion | 4 |

## Placeholder scan

No TBD; term band thresholds documented in Task 2 implement step.

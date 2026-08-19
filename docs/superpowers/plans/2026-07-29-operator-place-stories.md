# Operator / Place Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed and display place, operator, demand, and numbers stories on public opportunity detail pages.

**Architecture:** Nullable `assets` columns hold optional story prose. A pure helper builds academy seed stories from site type + place + public operator label. Detail Location/Operator sections render stories when present and fall back to today’s thin templates when null.

**Tech Stack:** Next.js 15 App Router, Drizzle/Postgres, vitest, existing opportunity detail components.

## Global Constraints

- Migration: edit `lib/db/schema.ts`, then `npm run db:generate` (never hand-edit applied migrations; head is **0026**, expect **0027**).
- Stories are academy concept scenarios; do not restate `blurb`; do not leak `operatorDisplay.legalName` when mode is `pattern`.
- No admin editors in this slice; admin-created assets leave stories null.
- Run JS from `apps/web` with Node 22 on PATH; `npm` with `--legacy-peer-deps` only when installing.
- Opportunity shortlist/compare remains out of scope.

## File map

| File | Responsibility |
|------|----------------|
| `lib/db/schema.ts` | Add four nullable text columns |
| `drizzle/0027_*.sql` + `drizzle/meta` | Generated migration |
| `AGENTS.md` | Update migration head to 0027 |
| `lib/assets/opportunity-stories.ts` | Pure seed/story builder + types |
| `lib/assets/opportunity-stories.test.ts` | Unit tests for builder + naming rules |
| `scripts/seed-assets.ts` | Map stories into insert/update |
| `components/opportunity-detail-location.tsx` | Render place/demand/numbers |
| `components/opportunity-detail-operator.tsx` | Render operator story or fallback |
| `components/opportunity-detail-client.tsx` | Pass story props |
| `app/opportunities/[slug]/page.tsx` | Load story fields from asset |
| `components/opportunity-detail-stories.test.tsx` | Render/fallback component tests |

---

### Task 1: Schema + migration + AGENTS head

**Files:**
- Modify: `apps/web/lib/db/schema.ts` (assets table)
- Create: generated `apps/web/drizzle/0027_*.sql` + meta via drizzle-kit
- Modify: `AGENTS.md` migration head line

**Interfaces:**
- Produces: `assets.placeStory`, `assets.operatorStory`, `assets.demandStory`, `assets.numbersNote` as `text(...).$type` optional/nullable columns

- [ ] **Step 1: Add columns to schema**

In `assets` table in `lib/db/schema.ts`, after `blurb` (or near other marketing text), add:

```ts
placeStory: text("place_story"),
operatorStory: text("operator_story"),
demandStory: text("demand_story"),
numbersNote: text("numbers_note"),
```

- [ ] **Step 2: Generate migration**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd apps/web
npm run db:generate
```

Expected: new `drizzle/0027_*.sql` adding the four nullable columns.

- [ ] **Step 3: Update AGENTS.md**

Change `current head: **0021**` to `current head: **0027**` (or whatever file number drizzle actually emitted).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/db/schema.ts apps/web/drizzle AGENTS.md
git commit -m "feat(web): add nullable opportunity story columns"
```

---

### Task 2: Story builder (TDD)

**Files:**
- Create: `apps/web/lib/assets/opportunity-stories.ts`
- Create: `apps/web/lib/assets/opportunity-stories.test.ts`

**Interfaces:**
- Produces:

```ts
export type OpportunityStories = {
  placeStory: string;
  operatorStory: string;
  demandStory: string;
  numbersNote: string;
};

export type StorySeedInput = {
  name: string;
  city: string;
  country: string;
  siteType?: string | null;
  publicOperatorLabel: string;
  /** Must not appear in output when provided */
  legalName?: string | null;
};

export function buildAcademyStories(input: StorySeedInput): OpportunityStories;
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildAcademyStories } from "@/lib/assets/opportunity-stories";

describe("buildAcademyStories", () => {
  it("builds station stories that mention the place and public operator label", () => {
    const s = buildAcademyStories({
      name: "INDIGO Gare de Lyon",
      city: "Paris",
      country: "France",
      siteType: "station",
      publicOperatorLabel: "National parking operator · France",
      legalName: "INDIGO"
    });
    expect(s.placeStory).toMatch(/Paris|Gare de Lyon|rail|station/i);
    expect(s.operatorStory).toContain("National parking operator · France");
    expect(s.operatorStory).not.toContain("INDIGO");
    expect(s.demandStory.length).toBeGreaterThan(40);
    expect(s.numbersNote).toMatch(/modelled|illustrative|concept/i);
  });

  it("varies demand language by site type", () => {
    const airport = buildAcademyStories({
      name: "Airport Hub",
      city: "Dublin",
      country: "Ireland",
      siteType: "airport",
      publicOperatorLabel: "National parking operator · Ireland"
    });
    expect(airport.placeStory + airport.demandStory).toMatch(/airport|flight|passenger/i);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/web && npx vitest run lib/assets/opportunity-stories.test.ts
```

- [ ] **Step 3: Implement `buildAcademyStories`**

Implement site-type branches (`station` | `airport` | `city` | `retail` | default) with 2–4 sentence templates. Always interpolate `city`, a short place token from `name` (strip leading brand tokens if easy, else use full `name`), and `publicOperatorLabel`. Never interpolate `legalName`.

`numbersNote` can be shared across types, e.g. academy modelled/illustrative wording.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/assets/opportunity-stories.ts apps/web/lib/assets/opportunity-stories.test.ts
git commit -m "feat(web): add academy opportunity story builder"
```

---

### Task 3: Wire seed script

**Files:**
- Modify: `apps/web/scripts/seed-assets.ts`

**Interfaces:**
- Consumes: `buildAcademyStories` + `publicOperatorLabel` from operator-display
- Produces: insert/update values including the four story columns

- [ ] **Step 1: Import and compute stories per row**

```ts
import { publicOperatorLabel } from "../lib/assets/operator-display";
import { buildAcademyStories } from "../lib/assets/opportunity-stories";

// inside values construction:
const publicLabel = publicOperatorLabel(row.operatorDisplay, row.operator);
const stories = buildAcademyStories({
  name: row.name,
  city: row.city,
  country: row.country,
  siteType: row.siteType,
  publicOperatorLabel: publicLabel,
  legalName: row.operatorDisplay?.legalName
});
```

- [ ] **Step 2: Add to insert and onConflict/update payloads**

```ts
placeStory: stories.placeStory,
operatorStory: stories.operatorStory,
demandStory: stories.demandStory,
numbersNote: stories.numbersNote,
```

Mirror on both insert `.values({...})` and update set object.

- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/seed-assets.ts
git commit -m "feat(web): seed opportunity stories for catalogue assets"
```

---

### Task 4: Detail UI (TDD) + page wiring

**Files:**
- Modify: `components/opportunity-detail-location.tsx`
- Modify: `components/opportunity-detail-operator.tsx`
- Modify: `components/opportunity-detail-client.tsx`
- Modify: `app/opportunities/[slug]/page.tsx`
- Create: `components/opportunity-detail-stories.test.tsx` (or colocated under `tests/`)

**Interfaces:**
- Optional props: `placeStory?: string | null`, `demandStory?: string | null`, `numbersNote?: string | null`, `operatorStory?: string | null`

- [ ] **Step 1: Write failing render tests** (use `@testing-library/react` if the repo already uses it for components; otherwise assert pure presentational helpers. Prefer RTL if present.)

```tsx
import { render, screen } from "@testing-library/react";
import { OpportunityDetailLocation } from "@/components/opportunity-detail-location";
import { OpportunityDetailOperator } from "@/components/opportunity-detail-operator";

const baseLoc = {
  city: "Paris",
  country: "France",
  siteType: "Station",
  visitorsPerDay: 100,
  visitorsProvenance: "modelled" as const,
  availableSpaces: 10,
  spaces: 100,
  annualRevenueEur: 1_000_000,
  revenueProvenance: "modelled" as const
};

it("omits story blocks when null", () => {
  render(<OpportunityDetailLocation {...baseLoc} />);
  expect(screen.queryByText(/What drives demand/i)).toBeNull();
});

it("shows place, demand, and numbers note when provided", () => {
  render(
    <OpportunityDetailLocation
      {...baseLoc}
      placeStory="Place matters because of the rail hub."
      demandStory="Commuters and travellers drive weekday demand."
      numbersNote="Operating figures are modelled academy illustrations."
    />
  );
  expect(screen.getByText(/Place matters/)).toBeTruthy();
  expect(screen.getByText(/Commuters and travellers/)).toBeTruthy();
  expect(screen.getByText(/modelled academy/)).toBeTruthy();
});

it("uses operator story when provided", () => {
  render(
    <OpportunityDetailOperator
      operatorLabel="National parking operator · France"
      operatorStory="The national parking operator runs a multi-city estate under a lease-style model."
    />
  );
  expect(
    screen.getByText(/multi-city estate/)
  ).toBeTruthy();
  expect(screen.queryByText(/Day-to-day operations sit with/)).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement Location**

After the “Located in…” paragraph, if `placeStory` trim nonempty, render `<p>{placeStory}</p>`. If `demandStory`, render `<h3 className="h4">What drives demand</h3>` + paragraph. Keep modelled banner; if `numbersNote`, render it as `<p className="field-hint">{numbersNote}</p>` immediately after/with that banner.

- [ ] **Step 4: Implement Operator**

If `operatorStory` trim nonempty, render it in the operator column; else existing template with `operatorLabel`.

- [ ] **Step 5: Thread props**

Add optional story fields to `OpportunityDetailClientProps`, pass through to Location/Operator. On `[slug]/page.tsx`, pass `asset.placeStory` etc.

- [ ] **Step 6: Run tests + `npx tsc --noEmit`**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(web): render opportunity stories on detail location and operator"
```

---

### Task 5: Verify

- [ ] **Step 1: Unit suite for touched files**

```bash
cd apps/web
npx vitest run lib/assets/opportunity-stories.test.ts components/opportunity-detail-stories.test.tsx
npx tsc --noEmit
```

- [ ] **Step 2: If local DB available, migrate + seed smoke**

```bash
npx drizzle-kit migrate
# DEMO_MODE=true as required by seed guard / local practice
npm run db:seed
```

- [ ] **Step 3: Push commits if not yet on origin**

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Nullable story columns + migration | 1 |
| No admin editors | (none — intentionally omitted) |
| Copy rules / no legalName leak | 2 |
| Seed all published assets | 3 (via builder) |
| Location UI + numbers_note by banner | 4 |
| Operator UI fallback | 4 |
| Overview unchanged | 4 (no story props) |
| Tests | 2, 4, 5 |

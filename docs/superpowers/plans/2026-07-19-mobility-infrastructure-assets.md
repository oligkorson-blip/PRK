# Mobility Infrastructure Assets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition Parkwise as parking-primary mobility infrastructure finance: `income_mix` on assets, replace catalogue with 24+ hubs under six European operators, and update marketing/catalogue/detail/admin to show selective ancillary revenue.

**Architecture:** Fixed stream taxonomy + validators in `lib/assets/income-streams.ts`. New `assets.income_mix` JSONB column. Seed JSON replaced and re-seeded with cleanup of demo interests/holdings for removed slugs. UI reads mix for badges, filters, and a detail panel; admin shows mix read-only.

**Tech Stack:** Next.js 15, Drizzle, Postgres, Vitest, existing `globals.css` brand tokens.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-mobility-infrastructure-assets-design.md`
- Parking-primary: every asset includes `vehicle_parking`; parking pct ≥ any other stream
- Yields/occupancy/mix are illustrative demo targets; operator names are illustrative only
- Canonical disclaimer required near yields, mix, and partners
- No admin mix editor; no normalized stream tables; no operator APIs
- Commit with: `git -c user.email="parkwise@local" -c user.name="Parkwise"`
- Node via nvm: `/Users/mac/.nvm/versions/node/v22.23.1/bin` on PATH when running npm
- Prefer worktree `.worktrees/mobility-infrastructure-assets` from `main`

## Out of scope

- Brand rename
- Live operator data
- Per-stream P&L fields
- Admin WYSIWYG mix editing
- Claiming operator endorsement

## File Structure

```
apps/web/
  lib/assets/income-streams.ts          # taxonomy, validate, helpers
  lib/db/schema.ts                      # incomeMix jsonb
  drizzle/0009_*.sql                    # migration
  scripts/seed-data.json                # 24–30 hubs (replace)
  scripts/seed-assets.ts                # validate + cleanup + upsert mix
  components/asset-card.tsx             # ancillary badges
  components/income-mix-panel.tsx       # detail/admin mix UI
  app/opportunities/opportunities-catalogue.tsx  # operator/EV/multi filters
  app/opportunities/page.tsx
  app/opportunities/[slug]/page.tsx
  app/page.tsx / why-parking / how-it-works / about
  app/admin/assets/page.tsx
  app/globals.css                       # mix bar, badges, filter-bar if needed
  tests/income-streams.test.ts
docs/SETUP.md                           # re-seed wipe note (create/update)
docs/plan-mobility-assets-verify.md
```

---

### Task 1: Income-stream taxonomy + validators (TDD)

**Files:**
- Create: `apps/web/lib/assets/income-streams.ts`
- Create: `apps/web/tests/income-streams.test.ts`

**Interfaces:**
- Produces:
  - `INCOME_STREAM_IDS` readonly tuple
  - `IncomeStreamId` type
  - `IncomeMixEntry = { id: IncomeStreamId; pct: number }`
  - `INCOME_STREAM_LABELS: Record<IncomeStreamId, string>`
  - `validateIncomeMix(mix: unknown): { ok: true; mix: IncomeMixEntry[] } | { ok: false; error: string }`
  - `hasEv(mix: IncomeMixEntry[]): boolean`
  - `isMultiIncome(mix: IncomeMixEntry[]): boolean`
  - `formatMixSummary(mix: IncomeMixEntry[]): string` // e.g. `Parking 70% · EV 20% · Bikes 10%`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  validateIncomeMix,
  hasEv,
  isMultiIncome,
  formatMixSummary
} from "@/lib/assets/income-streams";

describe("validateIncomeMix", () => {
  it("accepts parking-only 100", () => {
    const r = validateIncomeMix([{ id: "vehicle_parking", pct: 100 }]);
    expect(r.ok).toBe(true);
  });

  it("accepts parking-dominant multi mix", () => {
    const r = validateIncomeMix([
      { id: "vehicle_parking", pct: 70 },
      { id: "ev_charging", pct: 20 },
      { id: "bicycle_storage", pct: 10 }
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejects missing parking", () => {
    const r = validateIncomeMix([{ id: "ev_charging", pct: 100 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects parking not dominant", () => {
    const r = validateIncomeMix([
      { id: "vehicle_parking", pct: 40 },
      { id: "ev_charging", pct: 60 }
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects bad sum", () => {
    const r = validateIncomeMix([
      { id: "vehicle_parking", pct: 80 },
      { id: "ev_charging", pct: 10 }
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects unknown id", () => {
    const r = validateIncomeMix([{ id: "helicopter_pad", pct: 100 }]);
    expect(r.ok).toBe(false);
  });
});

describe("helpers", () => {
  const mix = [
    { id: "vehicle_parking" as const, pct: 70 },
    { id: "ev_charging" as const, pct: 30 }
  ];
  it("hasEv / isMultiIncome / formatMixSummary", () => {
    expect(hasEv(mix)).toBe(true);
    expect(isMultiIncome(mix)).toBe(true);
    expect(formatMixSummary(mix)).toMatch(/Parking/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
export PATH="/Users/mac/.nvm/versions/node/v22.23.1/bin:$PATH"
cd apps/web && npx vitest run tests/income-streams.test.ts
```

Expected: module not found / FAIL

- [ ] **Step 3: Implement `lib/assets/income-streams.ts`**

Implement taxonomy IDs/labels from the spec, validation rules (sum 99.5–100.5, parking present and ≥ each other stream), and helpers. Use short labels in `formatMixSummary` (Parking, EV, Bikes, Lockers, Car-share, Micro charge, Logistics, Cleaning, Fleet).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/assets/income-streams.ts apps/web/tests/income-streams.test.ts
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "Add income-mix taxonomy and validators."
```

---

### Task 2: Migration — `assets.income_mix`

**Files:**
- Modify: `apps/web/lib/db/schema.ts` (`assets` table)
- Generate: `apps/web/drizzle/0009_*.sql`, meta journal

**Interfaces:**
- Consumes: none
- Produces: `assets.incomeMix` mapped to `income_mix` jsonb, typed as `IncomeMixEntry[]` via `$type<IncomeMixEntry[]>()` if Drizzle supports it in this project style; otherwise `jsonb("income_mix").$type<IncomeMixEntry[]>().notNull()`

- [ ] **Step 1: Add column to schema**

In `assets` table definition, add:

```ts
incomeMix: jsonb("income_mix")
  .$type<{ id: string; pct: number }[]>()
  .notNull()
  .default([{ id: "vehicle_parking", pct: 100 }]),
```

(Adjust `.default` syntax to match Drizzle version used in repo — if default JSON is awkward, use SQL default in migration only and require seed immediately.)

- [ ] **Step 2: Generate migration**

```bash
cd apps/web && npx drizzle-kit generate
```

Expected: `0009_*.sql` with `ALTER TABLE assets ADD COLUMN income_mix jsonb ...`

- [ ] **Step 3: Apply locally (Docker or host)**

```bash
cd apps/web && npm run db:migrate
# or: docker compose exec -T web npm run db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/db/schema.ts apps/web/drizzle
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "Add assets.income_mix column."
```

---

### Task 3: Replace seed data (24–30 hubs)

**Files:**
- Replace: `apps/web/scripts/seed-data.json`
- Modify: `apps/web/scripts/seed-assets.ts`

**Interfaces:**
- Consumes: `validateIncomeMix` from Task 1
- Produces: DB full of new published assets with `incomeMix`; old slugs removed; interests/holdings for removed assets deleted

- [ ] **Step 1: Author `seed-data.json`**

Replace file contents with **24–30** hubs meeting operator mins from the spec:

| Operator | Min |
|---|---|
| INDIGO | 4 |
| Q-Park | 4 |
| APCOA | 4 |
| Effia | 3 |
| Euro Car Parks | 3 |
| Interparking | 4 |

Each row shape:

```json
{
  "id": "effia-gare-du-nord",
  "name": "Effia Gare du Nord",
  "operator": "Effia",
  "city": "Paris",
  "district": "Paris 10",
  "country": "France",
  "yield": 8.1,
  "tier": "Premium",
  "from": 12500,
  "spaces": 540,
  "occupancy": 97.2,
  "lease": "15 years",
  "art": 1,
  "siteType": "station",
  "blurb": "Station-adjacent parking serving Gare du Nord. Illustrative mix includes EV and bicycle storage for transit users.",
  "incomeMix": [
    { "id": "vehicle_parking", "pct": 70 },
    { "id": "ev_charging", "pct": 20 },
    { "id": "bicycle_storage", pct: 10 }
  ]
}
```

Fix JSON to valid (`"pct": 10`). Use real-location patterns; 60–75% multi-income; rest parking-only. Operator strings must match filter values exactly: `INDIGO`, `Q-Park`, `APCOA`, `Effia`, `Euro Car Parks`, `Interparking`.

- [ ] **Step 2: Update `seed-assets.ts`**

Extend `StaticAsset` with `incomeMix`. Before upsert loop:

1. Parse JSON  
2. `validateIncomeMix` every row — `process.exit(1)` on failure  
3. Load existing asset slugs from DB  
4. Compute `removed = existingSlugs - newSlugs`  
5. For removed asset UUIDs: delete `interests` and `holdings` referencing those `asset_id`s, then delete those `assets` rows (or delete by slug)  
6. Upsert each new row including `incomeMix: row.incomeMix`  
7. Log counts: seeded, removed, multi-income share  

Import `interests`, `holdings`, `eq`, `inArray` as needed from project DB modules.

- [ ] **Step 3: Run seed**

```bash
cd apps/web && npm run db:seed
# or docker compose exec -T web npm run db:seed
```

Expected: `Seeded N assets` with N ≥ 24; no validation errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/seed-data.json apps/web/scripts/seed-assets.ts
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "Replace catalogue seed with parking-primary multi-income hubs."
```

---

### Task 4: Catalogue UI — badges + filters

**Files:**
- Modify: `apps/web/components/asset-card.tsx`
- Modify: `apps/web/app/opportunities/opportunities-catalogue.tsx`
- Modify: `apps/web/app/opportunities/page.tsx`
- Modify: `apps/web/app/globals.css` (badge/filter styles if missing)

**Interfaces:**
- Extends `AssetCardData` with `operator: string` and `incomeMix: IncomeMixEntry[]` (or serializable `{id,pct}[]`)
- Catalogue filters: tier, city, operator, hasEv, multiIncome

- [ ] **Step 1: Extend card data + badges**

Pass `operator` + `incomeMix` into cards. Render small badges for non-parking streams using `INCOME_STREAM_LABELS`. If multi-income, optional chip “Multi-income”.

- [ ] **Step 2: Extend catalogue filters**

Add selects: Operator, Has EV (all/yes), Multi-income (all/yes). Filter using `hasEv` / `isMultiIncome` from Task 1 (import in client — pure functions, no DB).

- [ ] **Step 3: Update opportunities page copy + serialization**

Lead: parking assets; some sites include extra contracted revenue. Map DB rows including `incomeMix` into catalogue props.

- [ ] **Step 4: Manual check**

```bash
# app running on :3000
curl -s http://127.0.0.1:3000/opportunities | grep -c 'filter-'
```

Expected: filter controls present; page 200.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/asset-card.tsx apps/web/app/opportunities apps/web/app/globals.css
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "Show income-mix badges and catalogue filters."
```

---

### Task 5: Detail + admin income mix panel

**Files:**
- Create: `apps/web/components/income-mix-panel.tsx`
- Modify: `apps/web/app/opportunities/[slug]/page.tsx`
- Modify: `apps/web/app/admin/assets/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- `IncomeMixPanel({ mix: IncomeMixEntry[] })` — stacked bar + legend + disclaimer line

- [ ] **Step 1: Build `IncomeMixPanel`**

Server or client component OK if no hooks required (server preferred). Render horizontal stacked bar with CSS flex widths = pct; legend list; sentence: “Illustrative share of contracted target income — not a guarantee.”

- [ ] **Step 2: Wire opportunity detail**

Below asset facts, render `<IncomeMixPanel mix={asset.incomeMix} />`. Ensure `getPublishedAssetBySlug` returns `incomeMix`.

- [ ] **Step 3: Admin assets**

Add column or secondary line using `formatMixSummary(asset.incomeMix)`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/income-mix-panel.tsx apps/web/app/opportunities/[slug]/page.tsx apps/web/app/admin/assets/page.tsx apps/web/app/globals.css
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "Add income-mix panel on detail and admin."
```

---

### Task 6: Marketing thesis + operator partners

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/why-parking/page.tsx`
- Modify: `apps/web/app/how-it-works/page.tsx` (short thesis touch)
- Modify: `apps/web/app/about/page.tsx` (six operator cards + disclaimer)
- Optional: shared `components/operator-partners.tsx` + `components/demo-disclaimer.tsx`

**Canonical disclaimer (near-verbatim from spec):**

> Parkwise is a demonstration platform and does not offer a real investment service. Operator names and location patterns are used for illustrative catalogue context only and do not imply partnership, endorsement, or an offering by those operators. Target yields, occupancy, and income-mix percentages are contractual illustrative targets for this demo — not guarantees and not operator-disclosed financials. Capital at risk.

- [ ] **Step 1: Home**

Keep Parkwise brand hero. Supporting line: **Mobility infrastructure finance**. One sentence on parking infrastructure that can host EV/mobility services. CTAs unchanged.

- [ ] **Step 2: Why parking**

Keep URL. H1/lead: why parking infrastructure remains investable; section on ancillaries hedging private-car-only policy risk (EU curb / sustainable mobility — plain language, no fake citations required).

- [ ] **Step 3: About partners**

Replace thin partner placeholder with six cards using stats from the spec (INDIGO, Q-Park, APCOA, Effia, Euro Car Parks, Interparking). Include disclaimer block.

- [ ] **Step 4: How it works**

One bullet/sentence: diligence includes reviewing illustrative income mix (parking + any ancillaries).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/page.tsx apps/web/app/why-parking apps/web/app/how-it-works apps/web/app/about apps/web/components/operator-partners.tsx apps/web/components/demo-disclaimer.tsx
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "Reposition marketing for mobility infrastructure thesis."
```

---

### Task 7: Docs + verify checklist

**Files:**
- Create or update: `docs/SETUP.md` (or `apps/web` setup section if that’s where Docker docs live — search repo; update the existing SETUP path used by the team)
- Create: `docs/plan-mobility-assets-verify.md`

- [ ] **Step 1: SETUP note**

Document: after pull, `db:migrate` then `db:seed`; seed **deletes** interests/holdings for removed asset slugs; income_mix required.

- [ ] **Step 2: Verify checklist**

Include: ≥24 assets; mix validation; filters; detail panel; partners disclaimer; admin summary; `npm test` includes income-streams.

- [ ] **Step 3: Run full tests**

```bash
cd apps/web && npm test -- --run
```

Expected: all pass including new tests.

- [ ] **Step 4: Commit**

```bash
git add docs/SETUP.md docs/plan-mobility-assets-verify.md
git -c user.email="parkwise@local" -c user.name="Parkwise" commit -m "Document mobility assets setup and verification."
```

---

## Spec coverage (self-check)

| Spec requirement | Task |
|---|---|
| Taxonomy + validation | 1 |
| `income_mix` column | 2 |
| Replace seed 24+ / operators / parking-primary | 3 |
| Catalogue badges + operator/EV/multi filters | 4 |
| Detail mix panel + admin read-only | 5 |
| Marketing thesis + partners + disclaimer | 6 |
| SETUP / verify / demo wipe note | 7 |
| Unit tests | 1, 7 |

## Placeholder scan

No TBD steps; seed authoring is explicit with matrix and JSON shape.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-mobility-infrastructure-assets.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  

**2. Inline Execution** — execute tasks in this session with checkpoints  

Which approach?

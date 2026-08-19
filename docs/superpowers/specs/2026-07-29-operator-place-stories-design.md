# Operator / Place Stories on Opportunity Detail — Design

Date: 2026-07-29  
Status: Approved  
Scope: `apps/web` public opportunity detail + asset seed data

## Intent

Make each published opportunity detail page answer, in plain language:

1. Why this **place** is familiar or strategically useful
2. Who **operates** it and what kind of parking estate they run
3. Which **demand** sources matter here
4. Which **numbers** are illustrative / modelled and what that means

Stories are **academy concept scenarios**, not verified claims. Existing academy concept labelling on the site stays as-is.

## Out of scope (this slice)

- Admin create/edit UI for story fields (content-governance P1 later)
- Claim source, review owner, image captions, document checklists
- Opportunity shortlist / compare tool (explicitly descope elsewhere)
- Changing operator display policy (`pattern` vs `named`)

## Approach

**Seed + public display only.** Add nullable story columns on `assets`, populate them in `db:seed`, render them on the detail page when present. Assets without stories keep today’s thin template UI.

## Data model

New nullable `text` columns on `assets` (Drizzle → `npm run db:generate` → new migration after current head **0026**, expected **0027**):

| Column | Purpose |
|--------|---------|
| `place_story` | Why the place matters (strategy / familiarity) |
| `operator_story` | Operator estate and day-to-day role |
| `demand_story` | Demand drivers for this site |
| `numbers_note` | Short honesty line on illustrative / modelled figures |

- All nullable; empty/`null` means “do not show this story block.”
- No default prose in the database — fallbacks live in UI only.
- Admin create/update paths leave these `null` until a later editor ships.

### Copy rules

- **Do not restate `blurb`.** Overview blurb stays the short pitch; stories deepen (strategy, estate, demand, assumptions).
- **`operator_story` must respect public naming.** Use the public operator label / pattern wording (e.g. “National parking operator · France”). Never leak `operatorDisplay.legalName` when mode is `pattern`.
- **`demand_story` must not duplicate the income-mix percentage list** — describe drivers; the mix panel remains the numeric breakdown.
- **`numbers_note` does not replace per-metric provenance** (`visitorsProvenance` / `revenueProvenance` on tiles).

### Seed strategy

- Populate stories for **all published seed assets** in `scripts/seed-data.json` (25 rows today).
- Prefer **site-type templates** (`station` / `airport` / `city` / `retail`) plus a short place-specific hook (city / station / airport name).
- Operator stories use the **public** `operatorDisplay.label` (or pattern for country), not legal names.
- `seed-assets.ts` must map the new fields on insert/update like `blurb`.

## Public UI

Wire props from `app/opportunities/[slug]/page.tsx` → `OpportunityDetailClient` → section components.

### Location (`OpportunityDetailLocation`)

Keep: city/country/site type line, metric tiles, existing modelled banner.

When present:

1. Render `place_story` as one or two short paragraphs under the heading.
2. Render `demand_story` after place story (subheading optional: “What drives demand”).
3. Render `numbers_note` **once**, adjacent to the existing modelled/provenance banner — not a second banner in Overview.

### Operator (`OpportunityDetailOperator`)

Keep the two-column layout (operator vs Parkwise).

- If `operator_story` is present: use it for the operator column body (still show public `operatorLabel` as the column context).
- If absent: keep today’s template sentence that inserts `operatorLabel`.
- Parkwise column unchanged.

### Overview

Unchanged aside from continuing to show `blurb`. No story fields here (avoids repetition).

### Empty / draft assets

Null stories → current UI. No empty headings or placeholder cards.

## Testing

- Unit: helpers or component logic — null stories → fallback template / omit blocks; non-null → render story text.
- Seed/contract: at least one published fixture (or seed sample) asserts stories are non-empty for a typical station asset; operator story does not contain known legal names used only in `legalName` for pattern-mode rows (spot-check).
- Existing catalogue/detail presentation tests updated for new optional props.
- No e2e requirement for this slice unless a smoke path already opens a detail page and can cheaply assert a story heading/paragraph.

## Verification

From `apps/web`:

- `npx drizzle-kit migrate` (CI / local) with new migration
- `npx tsc --noEmit`
- `npx vitest run` (touched suites)
- Manual: open one station, one airport, one city detail page after seed and confirm stories appear without duplicating the blurb

## Success criteria

A signed-out visitor on a seeded opportunity detail page can answer the four audit questions from Location + Operator without opening admin or creating an account.

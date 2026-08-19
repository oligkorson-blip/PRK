# Content Governance (Admin Honesty Fields) — Design

Date: 2026-07-29  
Status: Approved  
Scope: `apps/web` admin opportunity edit + light public gallery caption

## Intent

Finish the ops path for academy honesty fields that already exist in the data
model or UI as static copy, and add only the one new public trust cue that
investors actually feel: a per-asset image caption.

This slice connects admin editing to public trust **without** inventing
compliance theater (fake claim sources, public “reviewed by” stamps, or soft
document checklists with no consequence).

## Product decisions (CPO cut)

| Audit item | Decision |
|---|---|
| Plain-language summary | **Out** — already `assets.blurb` (admin “Description”) |
| Illustration vs verified | **In** — expose existing `visitorsProvenance` / `revenueProvenance` in admin |
| Story fields | **In** — admin editors for `place_story`, `operator_story`, `demand_story`, `numbers_note` |
| Image caption | **In** — new nullable caption; public under gallery; keep existing concept-visual hint |
| Claim source (free text) | **Out** — academy “sources” would look like false verification |
| Review owner / date (public) | **Out** — implies diligence the academy does not perform |
| Review owner / date (admin-only) | **Optional / deferred** — not required for this slice |
| Required document checklist | **Out** — soft checklist without a publish gate is clutter |
| Hard publish gate | **Out** — later slice if needed |

## Out of scope

- Free-text claim source fields
- Public content-review stamp on opportunity detail
- Soft or hard required-document checklist / publish gates beyond today’s spaces/occupancy check
- Second summary field parallel to `blurb`
- Changing draft-only full edit policy (published assets still status-managed; images remain editable via the existing capacity/images path)
- Opportunity compare / shortlist

## Approach

Extend the draft `AssetForm` (and image save path) so staff can edit honesty
fields that seed already populates. Add one new column for cover/gallery
caption. Surface the caption on the public detail gallery when set.

## Data model

Current migration head: **0027**. Next migration: **0028** via
`schema.ts` → `npm run db:generate` (never hand-edit applied migrations).

### New column

| Column | Type | Purpose |
|--------|------|---------|
| `cover_image_caption` | nullable `text` | Short caption for the opportunity gallery / cover imagery |

Empty/`null` → do not render a caption line beyond the existing static
concept-visual hint in the gallery component.

### Existing columns (admin wiring only — no schema change)

- `place_story`, `operator_story`, `demand_story`, `numbers_note`
- `visitors_provenance`, `revenue_provenance`

Optional later (not this migration): `content_reviewed_by`, `content_reviewed_at`
as admin-only hygiene — omit until there is a clear internal workflow.

## Admin UX

### Draft create / edit (`AssetForm` + `validateAssetForm` / `assetToFormInput`)

Add a **Content & honesty** section (or equivalent grouping) with:

1. **Stories** — four optional text areas: place, operator, demand, numbers note  
   - Same copy rules as the stories spec: do not restate `blurb`; operator story
     uses public operator wording, never pattern-mode `legalName`.
2. **Metric provenance** — selects for visitors and revenue:
   `contracted` | `modelled` | `withheld` (existing enum).
3. Do **not** add a second description / summary field.

Create and draft update actions persist these fields with the rest of the form.
Omit/blank story fields store as `null` (trim empty → null).

### Images (`AssetImageForm` + `updateAssetImages`)

- Add **Cover / gallery caption** text input bound to `cover_image_caption`.
- Caption is editable wherever images are editable today (draft edit page and
  the published-asset “Edit capacity & images” disclosure on the assets list),
  so imagery honesty can be fixed without unpublishing.

### Publish

Unchanged. No new governance publish blockers.

## Public UI

### Gallery (`AssetGallery` / `card-art` opportunity gallery)

When `coverImageCaption` is non-empty:

- Render it as the primary caption under the main image.
- Keep the existing static concept-visual / orientation hint **below** or as a
  secondary line so academy honesty is not lost.

When caption is empty: behaviour unchanged (static hint only).

### Elsewhere

No public review stamp. No claim-source chrome. Provenance tiles and
`numbers_note` remain as today (now editable from admin for drafts).

Wire caption from `app/opportunities/[slug]/page.tsx` → detail client → gallery.

## Seed

- Optionally set a short `cover_image_caption` for a few representative seed
  assets (or all) so demos show the caption path; not required for every row.
- Existing story + provenance seed paths stay as-is.

## Testing

- `validateAssetForm` / `assetToFormInput`: round-trip stories, provenance, caption.
- Admin actions: update draft persists new fields; `updateAssetImages` persists caption.
- Gallery / detail: caption present → rendered; null → static hint only.
- Regression: existing provenance / stories display tests still pass.

## Verification

From `apps/web`:

- `npx drizzle-kit migrate`
- `npx tsc --noEmit`
- `npx vitest run` (targeted + full as needed)
- Manual: edit a draft’s stories/provenance/caption; publish path unchanged;
  detail page shows caption when set.

## Success criteria

1. Super admin can edit story fields and metric provenance on a draft without re-seeding.
2. Staff can set an image caption on draft or via the images form; investors see it on detail.
3. No new public “reviewed / verified source” chrome that overclaims academy content.
4. CI stays green (migrate, tsc, vitest, build, e2e).

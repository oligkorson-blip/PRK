# Content Governance (Admin Honesty Fields) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let super admins edit opportunity stories and metric provenance on drafts, set a cover/gallery caption (including on published assets via the images form), and show that caption on the public detail gallery.

**Architecture:** One new nullable `cover_image_caption` column. Extend `AssetFormInput` / `validateAssetForm` for stories + provenance; persist via existing create/update draft actions. Extend `updateAssetImages` + `AssetImageForm` for caption. Pass caption into `OpportunityGallery` under the existing concept-visual hint.

**Tech Stack:** Next.js 15 App Router, Drizzle/Postgres, vitest, existing admin asset forms and opportunity detail components.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-content-governance-admin-design.md` (CPO cut).
- Migration: edit `lib/db/schema.ts`, then `npm run db:generate` (never hand-edit applied migrations; head is **0027**, expect **0028**). Update `AGENTS.md` head.
- **Out:** free-text claim source, public review stamp, soft/hard doc checklist, second blurb, publish-gate changes.
- Stories copy rules unchanged: do not restate `blurb`; operator story must not leak pattern-mode `legalName` (admin is free text — no automatic legalName scrub; ops responsibility; tests only cover form round-trip).
- Run JS from `apps/web` with `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`.
- Server actions return `{ ok: true, ... }` / `{ ok: false, error }` — no throws for expected failures.
- Commit only when the user asks, or follow plan commit steps when executing this plan as authorized work.

## File map

| File | Responsibility |
|------|----------------|
| `lib/db/schema.ts` | Add `coverImageCaption` |
| `drizzle/0028_*.sql` + `drizzle/meta` | Generated migration |
| `AGENTS.md` | Migration head → 0028 |
| `lib/assets/asset-form.ts` | Stories + provenance on form input / validate / prefill |
| `lib/assets/asset-form.test.ts` | Round-trip + provenance validation tests |
| `components/asset-form.tsx` | Content & honesty UI section |
| `lib/assets/admin-actions.ts` | Persist caption in `updateAssetImages` |
| `tests/asset-admin-actions.test.ts` | Caption persist / validation coverage |
| `components/asset-image-form.tsx` | Caption field |
| `app/admin/assets/[id]/edit/page.tsx` | Pass caption into `AssetImageForm` |
| `app/admin/assets/page.tsx` | Pass caption into list `AssetImageForm` |
| `components/card-art.tsx` | Render caption in `OpportunityGallery` |
| `components/opportunity-detail-overview.tsx` | Pass caption prop |
| `components/opportunity-detail-client.tsx` | Pass caption prop |
| `app/opportunities/[slug]/page.tsx` | Load caption from asset |
| `tests/opportunity-gallery-caption.test.tsx` | Gallery caption render/fallback |
| `scripts/seed-assets.ts` (+ optional seed data) | Optional demo captions |

---

### Task 1: Schema + migration + AGENTS head

**Files:**
- Modify: `apps/web/lib/db/schema.ts` (assets table, near `coverImageUrl`)
- Create: generated `apps/web/drizzle/0028_*.sql` + meta via drizzle-kit
- Modify: `AGENTS.md` migration head line

**Interfaces:**
- Produces: `assets.coverImageCaption` → DB `cover_image_caption` nullable `text`

- [ ] **Step 1: Add column to schema**

In `assets` in `lib/db/schema.ts`, after `coverImageUrl` (before or after `galleryImageUrls`), add:

```ts
/** Optional caption for cover / gallery imagery on the public detail page. */
coverImageCaption: text("cover_image_caption"),
```

- [ ] **Step 2: Generate migration**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd apps/web
npm run db:generate
```

Expected: new `drizzle/0028_*.sql` adding nullable `cover_image_caption`.

- [ ] **Step 3: Update AGENTS.md**

Change `current head: **0027**` to `current head: **0028**` (or the number drizzle emitted).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/db/schema.ts apps/web/drizzle AGENTS.md
git commit -m "feat(web): add cover_image_caption on assets"
```

---

### Task 2: Form validation — stories + provenance (TDD)

**Files:**
- Modify: `apps/web/lib/assets/asset-form.ts`
- Modify: `apps/web/lib/assets/asset-form.test.ts`

**Interfaces:**
- Extends `AssetFormInput` with:

```ts
placeStory: string;
operatorStory: string;
demandStory: string;
numbersNote: string;
visitorsProvenance: string;
revenueProvenance: string;
```

- Extends `ValidatedAssetForm` with:

```ts
placeStory: string | null;
operatorStory: string | null;
demandStory: string | null;
numbersNote: string | null;
visitorsProvenance: MetricProvenance;
revenueProvenance: MetricProvenance;
```

- Helper (inline in `asset-form.ts`): empty trim → `null` for story fields; reject unknown provenance via `isMetricProvenance`.

- [ ] **Step 1: Write failing tests**

In `asset-form.test.ts`, extend `validInput()` defaults:

```ts
placeStory: "",
operatorStory: "",
demandStory: "",
numbersNote: "",
visitorsProvenance: "withheld",
revenueProvenance: "withheld",
```

Add tests:

```ts
it("persists trimmed story fields and defaults blank stories to null", () => {
  const result = validateAssetForm(
    validInput({
      placeStory: "  Place matters.  ",
      operatorStory: "",
      demandStory: " Demand drivers. ",
      numbersNote: "   "
    })
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.values.placeStory).toBe("Place matters.");
  expect(result.values.operatorStory).toBeNull();
  expect(result.values.demandStory).toBe("Demand drivers.");
  expect(result.values.numbersNote).toBeNull();
});

it("accepts contracted/modelled/withheld provenance", () => {
  const result = validateAssetForm(
    validInput({ visitorsProvenance: "modelled", revenueProvenance: "contracted" })
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.values.visitorsProvenance).toBe("modelled");
  expect(result.values.revenueProvenance).toBe("contracted");
});

it("rejects unknown provenance", () => {
  expect(validateAssetForm(validInput({ visitorsProvenance: "audited" }))).toEqual({
    ok: false,
    error: "Unknown visitors provenance."
  });
  expect(validateAssetForm(validInput({ revenueProvenance: "guess" }))).toEqual({
    ok: false,
    error: "Unknown revenue provenance."
  });
});
```

Update the `asset` fixture in `assetToFormInput` tests to include story columns + assert mapping:

```ts
placeStory: "Place story",
operatorStory: null,
demandStory: "Demand story",
numbersNote: "Numbers note",
// visitorsProvenance / revenueProvenance already on fixture
```

```ts
expect(input.placeStory).toBe("Place story");
expect(input.operatorStory).toBe("");
expect(input.demandStory).toBe("Demand story");
expect(input.numbersNote).toBe("Numbers note");
expect(input.visitorsProvenance).toBe("withheld");
expect(input.revenueProvenance).toBe("withheld");
```

Also add `coverImageCaption` to the Asset fixture as `null` once the column exists (TypeScript), even though caption is not on `AssetFormInput`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd apps/web
npx vitest run lib/assets/asset-form.test.ts
```

Expected: FAIL (missing form fields / assertions).

- [ ] **Step 3: Implement form types + validation**

In `asset-form.ts`:

```ts
import { isMetricProvenance, type MetricProvenance } from "@/lib/assets/metric-provenance";

function optionalText(raw: string): string | null {
  const t = raw.trim();
  return t ? t : null;
}
```

Extend `AssetFormInput`, `emptyAssetFormInput`, `ValidatedAssetForm`, `validateAssetForm` return values, and `assetToFormInput`:

```ts
// in validateAssetForm, after blurb checks:
if (!isMetricProvenance(input.visitorsProvenance)) {
  return { ok: false, error: "Unknown visitors provenance." };
}
if (!isMetricProvenance(input.revenueProvenance)) {
  return { ok: false, error: "Unknown revenue provenance." };
}

// in values:
placeStory: optionalText(input.placeStory),
operatorStory: optionalText(input.operatorStory),
demandStory: optionalText(input.demandStory),
numbersNote: optionalText(input.numbersNote),
visitorsProvenance: input.visitorsProvenance,
revenueProvenance: input.revenueProvenance,
```

```ts
// assetToFormInput:
placeStory: asset.placeStory ?? "",
operatorStory: asset.operatorStory ?? "",
demandStory: asset.demandStory ?? "",
numbersNote: asset.numbersNote ?? "",
visitorsProvenance: asset.visitorsProvenance ?? "withheld",
revenueProvenance: asset.revenueProvenance ?? "withheld",
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run lib/assets/asset-form.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/assets/asset-form.ts apps/web/lib/assets/asset-form.test.ts
git commit -m "feat(web): validate opportunity stories and metric provenance on asset form"
```

---

### Task 3: AssetForm UI — Content & honesty section

**Files:**
- Modify: `apps/web/components/asset-form.tsx`

**Interfaces:**
- Consumes: extended `AssetFormInput` from Task 2
- Produces: FormData fields `placeStory`, `operatorStory`, `demandStory`, `numbersNote`, `visitorsProvenance`, `revenueProvenance`

- [ ] **Step 1: Extend `inputFromForm`**

```ts
placeStory: String(fd.get("placeStory") ?? ""),
operatorStory: String(fd.get("operatorStory") ?? ""),
demandStory: String(fd.get("demandStory") ?? ""),
numbersNote: String(fd.get("numbersNote") ?? ""),
visitorsProvenance: String(fd.get("visitorsProvenance") ?? "withheld"),
revenueProvenance: String(fd.get("revenueProvenance") ?? "withheld"),
```

- [ ] **Step 2: Add UI after Description (before Cover image URL)**

```tsx
<fieldset className="form-field">
  <legend>Content &amp; honesty</legend>
  <p className="field-hint">
    Optional academy stories and figure labels. Leave blank to keep thin public templates /
    withheld metrics. Do not restate the Description.
  </p>
  <label className="form-field">
    <span>Place story</span>
    <textarea name="placeStory" rows={3} defaultValue={initial.placeStory} />
  </label>
  <label className="form-field">
    <span>Operator story</span>
    <textarea name="operatorStory" rows={3} defaultValue={initial.operatorStory} />
  </label>
  <label className="form-field">
    <span>Demand story</span>
    <textarea name="demandStory" rows={3} defaultValue={initial.demandStory} />
  </label>
  <label className="form-field">
    <span>Numbers note</span>
    <textarea name="numbersNote" rows={2} defaultValue={initial.numbersNote} />
  </label>
  <label className="form-field">
    <span>Visitors figure label</span>
    <select name="visitorsProvenance" defaultValue={initial.visitorsProvenance}>
      <option value="withheld">Withheld</option>
      <option value="modelled">Modelled</option>
      <option value="contracted">Contracted</option>
    </select>
  </label>
  <label className="form-field">
    <span>Revenue figure label</span>
    <select name="revenueProvenance" defaultValue={initial.revenueProvenance}>
      <option value="withheld">Withheld</option>
      <option value="modelled">Modelled</option>
      <option value="contracted">Contracted</option>
    </select>
  </label>
</fieldset>
```

Create/update draft actions already spread `parsed.values` — no action change required if ValidatedAssetForm includes the new keys.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS (update any other `AssetFormInput` literals in tests, e.g. `tests/asset-admin-actions.test.ts` `validInput`).

- [ ] **Step 4: Fix admin-actions test fixture**

In `tests/asset-admin-actions.test.ts` `validInput`, add the same six defaults as Task 2.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/asset-form.tsx apps/web/tests/asset-admin-actions.test.ts
git commit -m "feat(web): add content and honesty fields to asset admin form"
```

---

### Task 4: Image caption — action + form (TDD)

**Files:**
- Modify: `apps/web/lib/assets/admin-actions.ts` (`updateAssetImages`)
- Modify: `apps/web/components/asset-image-form.tsx`
- Modify: `apps/web/app/admin/assets/[id]/edit/page.tsx`
- Modify: `apps/web/app/admin/assets/page.tsx`
- Modify: `apps/web/tests/asset-admin-actions.test.ts`

**Interfaces:**
- Extends `updateAssetImages` input with `coverImageCaption: string`
- Persists `coverImageCaption: trim → null`
- `AssetImageForm` props gain `coverImageCaption: string | null`

- [ ] **Step 1: Write failing tests for `updateAssetImages`**

Add import of `updateAssetImages`. Pattern after existing mocks — select returns asset with slug; update chain returns; assert `.set` includes caption:

```ts
describe("updateAssetImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
  });

  function mockExistingAsset() {
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: "asset-1", slug: "lisbon-airport-parking", status: "published" }
          ])
        })
      })
    });
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined)
    });
    updateMock.mockReturnValue({ set });
    insertMock.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    return set;
  }

  it("persists a trimmed cover image caption", async () => {
    const set = mockExistingAsset();
    const result = await updateAssetImages({
      assetId: "asset-1",
      coverImageUrl: "https://images.example.com/lisbon.jpg",
      galleryImageUrlsText: "",
      coverImageCaption: "  Terminal forecourt, illustrative.  "
    });
    expect(result).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        coverImageCaption: "Terminal forecourt, illustrative."
      })
    );
  });

  it("stores blank caption as null", async () => {
    const set = mockExistingAsset();
    const result = await updateAssetImages({
      assetId: "asset-1",
      coverImageUrl: "",
      galleryImageUrlsText: "",
      coverImageCaption: "   "
    });
    expect(result).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ coverImageCaption: null })
    );
  });
});
```

Adapt mock shape to match whatever helpers the file already uses for `update`/`select` if they differ — keep assertions on caption.

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/asset-admin-actions.test.ts
```

- [ ] **Step 3: Implement action**

```ts
export async function updateAssetImages(input: {
  assetId: string;
  coverImageUrl: string;
  galleryImageUrlsText: string;
  coverImageCaption: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // ... existing auth + URL validation ...
  const caption = input.coverImageCaption.trim() || null;
  // in .set:
  coverImageCaption: caption,
  // in audit payload:
  coverImageCaption: caption,
}
```

- [ ] **Step 4: Wire `AssetImageForm`**

```tsx
export function AssetImageForm({
  assetId,
  coverImageUrl,
  galleryImageUrls,
  coverImageCaption
}: {
  assetId: string;
  coverImageUrl: string | null;
  galleryImageUrls: string[];
  coverImageCaption: string | null;
}) {
  // in submit:
  coverImageCaption: String(fd.get("coverImageCaption") ?? ""),
  // in JSX after gallery URLs:
  <label className="form-field">
    <span>Cover / gallery caption</span>
    <input
      name="coverImageCaption"
      type="text"
      defaultValue={coverImageCaption ?? ""}
      placeholder="e.g. Terminal forecourt — illustrative academy visual"
    />
  </label>
}
```

Pass `coverImageCaption={asset.coverImageCaption}` / `a.coverImageCaption` from edit page and admin assets list (ensure list query selects full asset row or the new column — today it uses full `assets` select; confirm).

- [ ] **Step 5: Run tests + tsc**

```bash
npx vitest run tests/asset-admin-actions.test.ts
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/assets/admin-actions.ts apps/web/components/asset-image-form.tsx \
  apps/web/app/admin/assets apps/web/tests/asset-admin-actions.test.ts
git commit -m "feat(web): allow editing cover image caption from admin images form"
```

---

### Task 5: Public gallery caption

**Files:**
- Modify: `apps/web/components/card-art.tsx` (`OpportunityGallery`)
- Modify: `apps/web/components/opportunity-detail-overview.tsx`
- Modify: `apps/web/components/opportunity-detail-client.tsx`
- Modify: `apps/web/app/opportunities/[slug]/page.tsx`
- Create: `apps/web/tests/opportunity-gallery-caption.test.tsx`

**Interfaces:**
- `OpportunityGallery` gains `coverImageCaption?: string | null`
- Prop thread: page → client → overview → gallery

- [ ] **Step 1: Write failing component test**

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpportunityGallery } from "@/components/card-art";

describe("OpportunityGallery caption", () => {
  it("renders the asset caption above the static concept hint when set", () => {
    const html = renderToStaticMarkup(
      createElement(OpportunityGallery, {
        name: "Lisbon Airport Parking",
        city: "Lisbon",
        coverImageUrl: "https://images.example.com/lisbon.jpg",
        galleryImageUrls: [],
        siteType: "airport",
        coverImageCaption: "Terminal forecourt, illustrative."
      })
    );
    expect(html).toContain("Terminal forecourt, illustrative.");
    expect(html).toMatch(/Site imagery for orientation|Illustrative photo/i);
  });

  it("keeps only the static hint when caption is empty", () => {
    const html = renderToStaticMarkup(
      createElement(OpportunityGallery, {
        name: "Lisbon Airport Parking",
        city: "Lisbon",
        coverImageUrl: null,
        siteType: "airport",
        coverImageCaption: null
      })
    );
    expect(html).not.toContain("Terminal forecourt");
    expect(html).toMatch(/Illustrative photo of a comparable site/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/opportunity-gallery-caption.test.tsx
```

- [ ] **Step 3: Implement gallery + prop wiring**

In `OpportunityGallery`, add prop `coverImageCaption?: string | null`. Replace the single hint `<p>` with:

```tsx
const caption = coverImageCaption?.trim() || null;
// ...
{caption ? <p className="opp-gallery-caption">{caption}</p> : null}
<p className="field-hint">
  {hasPhotos
    ? "Site imagery for orientation. Always read the opportunity documents before you invest."
    : "Illustrative photo of a comparable site. Final diligence uses opportunity documents and operator materials."}
</p>
```

Wire:

```tsx
// overview
coverImageCaption={coverImageCaption}

// client props + overview call
coverImageCaption?: string | null;

// page
coverImageCaption={asset.coverImageCaption}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/opportunity-gallery-caption.test.tsx tests/opportunity-detail-stories.test.tsx
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/card-art.tsx \
  apps/web/components/opportunity-detail-overview.tsx \
  apps/web/components/opportunity-detail-client.tsx \
  apps/web/app/opportunities/\[slug\]/page.tsx \
  apps/web/tests/opportunity-gallery-caption.test.tsx
git commit -m "feat(web): show cover image caption on opportunity gallery"
```

---

### Task 6: Optional seed captions + verification

**Files:**
- Modify: `apps/web/scripts/seed-assets.ts` (and seed row type / `seed-data.json` if captions are data-driven)

**Interfaces:**
- On insert/upsert, set `coverImageCaption` when provided; otherwise leave null / unchanged.

- [ ] **Step 1: Seed at least one caption (recommended)**

Either hardcode a short caption for the first published seed asset in `seed-assets.ts`, or add optional `coverImageCaption` on the seed row type and set it for 1–3 representative assets in `seed-data.json`. Keep captions clearly illustrative (e.g. “Gare de Lyon approach — academy concept visual”).

- [ ] **Step 2: Full verification**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd apps/web
npx tsc --noEmit
npx vitest run lib/assets/asset-form.test.ts tests/asset-admin-actions.test.ts tests/opportunity-gallery-caption.test.tsx
npx vitest run
```

Expected: all PASS.

- [ ] **Step 3: Mark design Approved + commit**

Update `docs/superpowers/specs/2026-07-29-content-governance-admin-design.md` status to `Approved`.

```bash
git add apps/web/scripts/seed-assets.ts apps/web/scripts/seed-data.json \
  docs/superpowers/specs/2026-07-29-content-governance-admin-design.md
git commit -m "chore(web): seed sample cover captions and approve governance spec"
```

- [ ] **Step 4: Push when asked**

```bash
git push -u origin HEAD
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| `cover_image_caption` migration 0028 | 1 |
| Admin story editors | 2–3 |
| Admin provenance selects | 2–3 |
| Caption on image form (draft + published path) | 4 |
| Public caption + keep static concept hint | 5 |
| Optional seed captions | 6 |
| No claim source / public review / doc checklist / publish gate | Global Constraints — not implemented |
| No second blurb | Global Constraints |

## Placeholder scan

No TBD/TODO steps; commands and code are concrete.

## Type consistency

- Form fields: `placeStory`, `operatorStory`, `demandStory`, `numbersNote`, `visitorsProvenance`, `revenueProvenance`
- DB/public: `coverImageCaption` / `cover_image_caption`
- Action: `updateAssetImages({ ..., coverImageCaption: string })`

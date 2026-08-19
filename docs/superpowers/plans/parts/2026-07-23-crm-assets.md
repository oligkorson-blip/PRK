# Area C — Opportunities / Assets (Tasks 7–8)

Spec: `docs/superpowers/specs/2026-07-23-crm-redesign-design.md`, section C ("Opportunities (`/admin/assets`) — super-admin only creation"), bound by section E (cross-cutting standards).

Scope notes discovered while reading the code (relevant for assembly):

- **"Target payment frequency" and "term" are not columns on `assets`.** They are presentation derivations (`lib/assets/presentation.ts:92-104`): payment frequency comes from the `contractual_monthly_rent` commercial term (`formatPaymentFrequency` → "Monthly" or "See opportunity details"), and term is the free-text `leaseLabel` column (seed values like `"12 years"`). The form therefore collects a payment-frequency select (Monthly / Other) that toggles `contractual_monthly_rent` inside `commercialTermIds`, and a term text input that writes `leaseLabel`. No schema change, no migration.
- **The spec's "EV" option is the `green` option id** in `lib/assets/investment-options.ts` (`INVESTMENT_OPTION_IDS = ["standard", "premium", "green"]`); seed data labels it `"EV option"`. "EV as applicable" is enforced by `supportsGreenOption(mix)` (EV charging or micromobility charging in the income mix) inside `validateInvestmentOptions`.
- **The form must collect the income mix** even though the spec's field list omits it: `validateInvestmentOptions` needs the mix as context (green gating), and the spec's own validation bullet requires "income mix sums to 100 with parking dominant" (`validateIncomeMix`, `lib/assets/income-streams.ts:45`). The form gets one percentage input per income stream, defaulting to `vehicle_parking = 100`.
- **The `assets` table has NOT NULL columns the spec's field list does not mention** (`lib/db/schema.ts:324-374`): `slug`, `district`, `tier`, `targetYieldPct`, `spaces`, `occupancyPct`. The server action derives/fills them with documented placeholders: `slug` slugified from the name (unique via `assets_slug_uidx`, friendly error on 23505), `district = city`, `tier = "Standard"` (a seed tier value), `targetYieldPct` = standard-option yield, `spaces = 0`, `occupancyPct = "0.00"`. Drafts are invisible to consumers (`listPublishedAssets` filters `status = "published"`), so placeholders cannot break consumer pages; ops refines content before publishing.
- **`isSafeHttpUrl` is currently a private helper in `lib/assets/admin-actions.ts:50-63`.** The new shared form-validation module needs it too, so it moves to `lib/assets/asset-form.ts` and `admin-actions.ts` imports it (single copy).
- **The assets table currently renders the raw status enum** (`app/admin/assets/page.tsx:55`: `<td>{a.status}</td>`), violating standard E ("no raw enum strings"). Task 7 adds an `ASSET_STATUS_LABEL` map (`lib/portal/labels.ts` pattern) since the page is being modified anyway.
- There is **no component-render test infrastructure** (no `@testing-library` in `apps/web/package.json`). Behavior is funneled into the pure module `lib/assets/asset-form.ts` plus action tests with a mocked `@/lib/db` (style of `tests/leads-admin-actions.test.ts`); pure markup edits get exact before/after edits plus `tsc`/`vitest` verification.
- The existing inline style in `components/asset-status-actions.tsx:30` (`display:flex; gap:8`) predates this round and no `stack-*` utility covers flex rows, so it is left untouched.

Common setup for every command (from the repo root unless noted):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd /Users/mac/Documents/Park/apps/web
```

---

### Task 7: Super-admin "New opportunity" create flow

A single form at `/admin/assets/new` creating an asset in `draft` status. All catalogue invariants are enforced server-side in a new pure module (`lib/assets/asset-form.ts`) that reuses `validateIncomeMix`, `validateInvestmentOptions`, `validateCommercialTermIds`, and `parseAdvisoryCapacityInput`, so a created asset can never break consumer pages. The `createAsset` server action follows the existing `lib/assets/admin-actions.ts` pattern (`requireSuperAdmin`, `{ ok, error }`, audit event, `revalidatePath`).

**Files:**
- Create: `apps/web/lib/assets/asset-form.ts`
- Test: `apps/web/lib/assets/asset-form.test.ts`
- Modify: `apps/web/lib/assets/admin-actions.ts`
- Test: `apps/web/tests/asset-admin-actions.test.ts`
- Create: `apps/web/lib/assets/labels.ts`
- Create: `apps/web/components/asset-form.tsx`
- Create: `apps/web/app/admin/assets/new/page.tsx`
- Modify: `apps/web/app/admin/assets/page.tsx`
- Modify: `apps/web/app/globals.css` (one `.admin-form` rule)

**Interfaces:**
- Consumes: nothing from earlier tasks (Tasks 1–6 are the leads/investors areas; this area is independent).
- Produces:
  - `slugifyAssetName(name: string): string`
  - `SITE_TYPE_OPTIONS: readonly ["airport", "city", "retail", "station"]`
  - `type AssetFormInput` (raw string/boolean form payload — serializable across the server-action boundary)
  - `type ValidatedAssetForm` (DB-ready insert values minus `status`)
  - `validateAssetForm(input: AssetFormInput): { ok: true; values: ValidatedAssetForm } | { ok: false; error: string }`
  - `emptyAssetFormInput(): AssetFormInput`
  - `isSafeHttpUrl(url: string): boolean` (moved out of `admin-actions.ts`; still used by `updateAssetImages`)
  - `createAsset(input: AssetFormInput): Promise<{ ok: true; assetId: string } | { ok: false; error: string }>` — writes `asset.created` audit event
  - `AssetForm` client component (`components/asset-form.tsx`), props `{ initial: AssetFormInput }` — create-only in this task; Task 8 extends it to `{ mode: "create" | "edit"; assetId?: string; initial: AssetFormInput }`
  - `ASSET_STATUS_LABEL: Record<string, string>` (`lib/assets/labels.ts`)

- [ ] **Step 1: Write the failing test for the pure form module**

  Create `apps/web/lib/assets/asset-form.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    emptyAssetFormInput,
    slugifyAssetName,
    validateAssetForm,
    type AssetFormInput
  } from "@/lib/assets/asset-form";

  function validInput(overrides: Partial<AssetFormInput> = {}): AssetFormInput {
    return {
      name: "Lisbon Airport Parking",
      city: "Lisbon",
      country: "Portugal",
      siteType: "airport",
      operator: "ParkOperator Lda",
      term: "12 years",
      paymentFrequency: "monthly",
      advisoryCapacityEur: "1500000",
      description: "Busy airport car park next to the terminal.",
      coverImageUrl: "https://images.example.com/lisbon.jpg",
      incomeMix: [
        { id: "vehicle_parking", pct: "80" },
        { id: "ev_charging", pct: "20" }
      ],
      standardMinTicketEur: "9900",
      standardYieldPct: "7.7",
      premiumEnabled: false,
      premiumMinTicketEur: "",
      premiumYieldPct: "",
      greenEnabled: false,
      greenMinTicketEur: "",
      greenYieldPct: "",
      ...overrides
    };
  }

  describe("slugifyAssetName", () => {
    it("lowercases, strips punctuation and diacritics", () => {
      expect(slugifyAssetName("Lisbon Airport — Parking!")).toBe("lisbon-airport-parking");
      expect(slugifyAssetName("München Süd")).toBe("munchen-sud");
    });

    it("returns an empty string when nothing usable remains", () => {
      expect(slugifyAssetName("  —!!!—  ")).toBe("");
    });
  });

  describe("emptyAssetFormInput", () => {
    it("defaults to a 100% vehicle parking mix and monthly frequency", () => {
      const input = emptyAssetFormInput();
      expect(input.incomeMix).toEqual([{ id: "vehicle_parking", pct: "100" }]);
      expect(input.paymentFrequency).toBe("monthly");
      expect(input.premiumEnabled).toBe(false);
      expect(input.greenEnabled).toBe(false);
    });
  });

  describe("validateAssetForm", () => {
    it("accepts a valid form and derives catalogue-consistent values", () => {
      const result = validateAssetForm(validInput());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.slug).toBe("lisbon-airport-parking");
      expect(result.values.targetYieldPct).toBe("7.70");
      expect(result.values.minTicketEur).toBe(9900);
      expect(result.values.leaseLabel).toBe("12 years");
      expect(result.values.blurb).toContain("airport car park");
      expect(result.values.advisoryCapacityEur).toBe(1500000);
      expect(result.values.coverImageUrl).toBe("https://images.example.com/lisbon.jpg");
      expect(result.values.commercialTermIds).toContain("contractual_monthly_rent");
      expect(result.values.investmentOptions).toHaveLength(1);
      const standard = result.values.investmentOptions[0]!;
      expect(standard.id).toBe("standard");
      expect(standard.annualIncomeEur).toBe(762); // round(9900 × 7.7 / 100)
      expect(standard.monthlyIncomeEur).toBe(64); // round(762 / 12)
      expect(standard.recommended).toBe(true);
    });

    it("drops contractual_monthly_rent when frequency is not monthly", () => {
      const result = validateAssetForm(validInput({ paymentFrequency: "other" }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.commercialTermIds).not.toContain("contractual_monthly_rent");
      expect(result.values.commercialTermIds.length).toBeGreaterThan(0);
    });

    it("rejects a premium yield below the standard yield", () => {
      const result = validateAssetForm(
        validInput({
          premiumEnabled: true,
          premiumMinTicketEur: "25000",
          premiumYieldPct: "7.0"
        })
      );
      expect(result).toEqual({ ok: false, error: "premium yield must be ≥ standard" });
    });

    it("accepts an EV (green) option when the mix supports it", () => {
      const result = validateAssetForm(
        validInput({
          greenEnabled: true,
          greenMinTicketEur: "15000",
          greenYieldPct: "8.5"
        })
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.investmentOptions.map((o) => o.id)).toEqual(["standard", "green"]);
      expect(result.values.investmentOptions[1]!.label).toBe("EV option");
    });

    it("rejects a green option without an EV or micromobility story", () => {
      const result = validateAssetForm(
        validInput({
          incomeMix: [{ id: "vehicle_parking", pct: "100" }],
          greenEnabled: true,
          greenMinTicketEur: "15000",
          greenYieldPct: "8.5"
        })
      );
      expect(result).toEqual({
        ok: false,
        error: "green option requires EV or micromobility charging story"
      });
    });

    it("rejects an income mix that does not sum to 100", () => {
      const result = validateAssetForm(
        validInput({
          incomeMix: [
            { id: "vehicle_parking", pct: "60" },
            { id: "ev_charging", pct: "20" }
          ]
        })
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("income mix percentages must sum to 100");
    });

    it("rejects an unsafe cover image URL", () => {
      const result = validateAssetForm(validInput({ coverImageUrl: "javascript:alert(1)" }));
      expect(result).toEqual({
        ok: false,
        error: "Cover image must be an http(s) URL or a site path starting with /."
      });
    });

    it("requires a name, term and description", () => {
      expect(validateAssetForm(validInput({ name: " " }))).toEqual({
        ok: false,
        error: "Name is required."
      });
      expect(validateAssetForm(validInput({ term: "" }))).toEqual({
        ok: false,
        error: 'Term is required (e.g. "12 years").'
      });
      expect(validateAssetForm(validInput({ description: "" }))).toEqual({
        ok: false,
        error: "Description is required."
      });
    });

    it("treats a blank advisory capacity as null", () => {
      const result = validateAssetForm(validInput({ advisoryCapacityEur: "" }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.values.advisoryCapacityEur).toBeNull();
    });
  });
  ```

  Run — expect failure (`Cannot find module '@/lib/assets/asset-form'`):

  ```bash
  npx vitest run lib/assets/asset-form.test.ts
  ```

- [ ] **Step 2: Implement the pure form module**

  Create `apps/web/lib/assets/asset-form.ts`:

  ```ts
  /**
   * Shared validation/derivation for the super-admin opportunity create/edit
   * form. Pure module: the server actions (lib/assets/admin-actions.ts) call
   * validateAssetForm, the client form (components/asset-form.tsx) imports the
   * types and option lists. Reuses the catalogue invariants so a form-created
   * asset can never break consumer pages.
   */

  import {
    DEFAULT_COMMERCIAL_TERM_IDS,
    validateCommercialTermIds,
    type CommercialTermId
  } from "@/lib/assets/commercial-terms";
  import { validateIncomeMix, type IncomeMixEntry } from "@/lib/assets/income-streams";
  import {
    buildStandardOption,
    optionAnnualIncome,
    optionMonthlyIncome,
    validateInvestmentOptions,
    type InvestmentOption,
    type InvestmentOptionId
  } from "@/lib/assets/investment-options";
  import { parseAdvisoryCapacityInput } from "@/lib/assets/advisory-capacity";

  /** Site types used across the seed catalogue (free text in the DB). */
  export const SITE_TYPE_OPTIONS = ["airport", "city", "retail", "station"] as const;

  export type AssetFormInput = {
    name: string;
    city: string;
    country: string;
    /** "" or one of SITE_TYPE_OPTIONS */
    siteType: string;
    operator: string;
    /** Free-text lease term, e.g. "12 years" (assets.leaseLabel). */
    term: string;
    /** "monthly" maps to the contractual_monthly_rent commercial term. */
    paymentFrequency: string;
    /** Raw text; "" clears (parseAdvisoryCapacityInput). */
    advisoryCapacityEur: string;
    /** Longer marketing description (assets.blurb). */
    description: string;
    /** "" allowed; http(s) URL or site path. */
    coverImageUrl: string;
    /** Raw per-stream percentages; "" rows are dropped before validation. */
    incomeMix: { id: string; pct: string }[];
    standardMinTicketEur: string;
    standardYieldPct: string;
    premiumEnabled: boolean;
    premiumMinTicketEur: string;
    premiumYieldPct: string;
    greenEnabled: boolean;
    greenMinTicketEur: string;
    greenYieldPct: string;
  };

  /** DB-ready insert values for a draft asset (status set by the action). */
  export type ValidatedAssetForm = {
    slug: string;
    name: string;
    operator: string;
    city: string;
    district: string;
    country: string;
    targetYieldPct: string;
    tier: string;
    minTicketEur: number;
    spaces: number;
    occupancyPct: string;
    leaseLabel: string;
    blurb: string;
    siteType: string | null;
    incomeMix: IncomeMixEntry[];
    commercialTermIds: CommercialTermId[];
    investmentOptions: InvestmentOption[];
    advisoryCapacityEur: number | null;
    coverImageUrl: string | null;
  };

  export function slugifyAssetName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics after NFKD
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  export function isSafeHttpUrl(url: string): boolean {
    // Reject protocol-relative URLs (//evil.example/…)
    if (url.startsWith("//")) return false;
    if (url.startsWith("/")) {
      // Site-relative path only — no scheme smuggling
      return !url.includes("://");
    }
    try {
      const u = new URL(url);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }

  export function emptyAssetFormInput(): AssetFormInput {
    return {
      name: "",
      city: "",
      country: "",
      siteType: "",
      operator: "",
      term: "",
      paymentFrequency: "monthly",
      advisoryCapacityEur: "",
      description: "",
      coverImageUrl: "",
      incomeMix: [{ id: "vehicle_parking", pct: "100" }],
      standardMinTicketEur: "",
      standardYieldPct: "",
      premiumEnabled: false,
      premiumMinTicketEur: "",
      premiumYieldPct: "",
      greenEnabled: false,
      greenMinTicketEur: "",
      greenYieldPct: ""
    };
  }

  function parsePositiveInt(
    raw: string,
    label: string
  ): { ok: true; value: number } | { ok: false; error: string } {
    const n = Number(raw.trim());
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: `${label} must be a positive whole number.` };
    }
    return { ok: true, value: n };
  }

  function parseYieldPct(
    raw: string,
    label: string
  ): { ok: true; value: number } | { ok: false; error: string } {
    const n = Number(raw.trim());
    if (!Number.isFinite(n) || n <= 0 || n > 100) {
      return { ok: false, error: `${label} must be a number between 0 and 100.` };
    }
    return { ok: true, value: n };
  }

  function buildOption(
    id: InvestmentOptionId,
    label: string,
    minTicketEur: number,
    yieldPct: number,
    commercialTermIds: CommercialTermId[]
  ): InvestmentOption {
    const annualIncomeEur = optionAnnualIncome(minTicketEur, yieldPct);
    return {
      id,
      label,
      recommended: false,
      minTicketEur,
      yieldPct,
      monthlyIncomeEur: optionMonthlyIncome(annualIncomeEur),
      annualIncomeEur,
      commercialTermIds
    };
  }

  export function validateAssetForm(
    input: AssetFormInput
  ): { ok: true; values: ValidatedAssetForm } | { ok: false; error: string } {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name is required." };
    const slug = slugifyAssetName(name);
    if (!slug) return { ok: false, error: "Name must contain letters or numbers." };

    const city = input.city.trim();
    if (!city) return { ok: false, error: "City is required." };
    const country = input.country.trim();
    if (!country) return { ok: false, error: "Country is required." };
    const operator = input.operator.trim();
    if (!operator) return { ok: false, error: "Operator is required." };

    const siteType = input.siteType.trim().toLowerCase();
    if (siteType && !(SITE_TYPE_OPTIONS as readonly string[]).includes(siteType)) {
      return { ok: false, error: "Unknown site type." };
    }

    const leaseLabel = input.term.trim();
    if (!leaseLabel) return { ok: false, error: 'Term is required (e.g. "12 years").' };

    if (input.paymentFrequency !== "monthly" && input.paymentFrequency !== "other") {
      return { ok: false, error: "Unknown payment frequency." };
    }

    const blurb = input.description.trim();
    if (!blurb) return { ok: false, error: "Description is required." };

    const cover = input.coverImageUrl.trim();
    if (cover && !isSafeHttpUrl(cover)) {
      return {
        ok: false,
        error: "Cover image must be an http(s) URL or a site path starting with /."
      };
    }

    const mixResult = validateIncomeMix(
      input.incomeMix
        .map((entry) => ({ id: entry.id, pct: entry.pct.trim() }))
        .filter((entry) => entry.pct !== "")
        .map((entry) => ({ id: entry.id, pct: Number(entry.pct) }))
    );
    if (!mixResult.ok) return { ok: false, error: `Income mix: ${mixResult.error}` };
    const mix = mixResult.mix;

    const commercialTermIds: CommercialTermId[] =
      input.paymentFrequency === "monthly"
        ? [...DEFAULT_COMMERCIAL_TERM_IDS]
        : DEFAULT_COMMERCIAL_TERM_IDS.filter((id) => id !== "contractual_monthly_rent");
    const terms = validateCommercialTermIds(commercialTermIds);
    if (!terms.ok) return terms;

    const stdMin = parsePositiveInt(input.standardMinTicketEur, "Standard minimum ticket");
    if (!stdMin.ok) return stdMin;
    const stdYield = parseYieldPct(input.standardYieldPct, "Standard target yield");
    if (!stdYield.ok) return stdYield;

    const options: InvestmentOption[] = [
      buildStandardOption({
        minTicketEur: stdMin.value,
        yieldPct: stdYield.value,
        commercialTermIds: terms.ids,
        recommended: true
      })
    ];

    if (input.premiumEnabled) {
      const min = parsePositiveInt(input.premiumMinTicketEur, "Premium minimum ticket");
      if (!min.ok) return min;
      const yieldPct = parseYieldPct(input.premiumYieldPct, "Premium target yield");
      if (!yieldPct.ok) return yieldPct;
      options.push(
        buildOption("premium", "Premium option", min.value, yieldPct.value, terms.ids)
      );
    }

    if (input.greenEnabled) {
      const min = parsePositiveInt(input.greenMinTicketEur, "EV minimum ticket");
      if (!min.ok) return min;
      const yieldPct = parseYieldPct(input.greenYieldPct, "EV target yield");
      if (!yieldPct.ok) return yieldPct;
      options.push(buildOption("green", "EV option", min.value, yieldPct.value, terms.ids));
    }

    // Catalogue invariants: income = min × yield, monotonic yields, exactly one
    // recommended, green only with an EV/micromobility story.
    const validatedOptions = validateInvestmentOptions(options, { mix });
    if (!validatedOptions.ok) return validatedOptions;

    const capacity = parseAdvisoryCapacityInput(input.advisoryCapacityEur);
    if (!capacity.ok) return capacity;

    return {
      ok: true,
      values: {
        slug,
        name,
        operator,
        city,
        // NOT NULL placeholders for columns the form does not collect; drafts
        // are invisible to consumers, ops refines content before publishing.
        district: city,
        country,
        targetYieldPct: stdYield.value.toFixed(2),
        tier: "Standard",
        minTicketEur: stdMin.value,
        spaces: 0,
        occupancyPct: "0.00",
        leaseLabel,
        blurb,
        siteType: siteType || null,
        incomeMix: mix,
        commercialTermIds: terms.ids,
        investmentOptions: validatedOptions.options,
        advisoryCapacityEur: capacity.value,
        coverImageUrl: cover || null
      }
    };
  }
  ```

  Run — expect pass:

  ```bash
  npx vitest run lib/assets/asset-form.test.ts
  ```

- [ ] **Step 3: Write the failing test for the `createAsset` server action**

  Create `apps/web/tests/asset-admin-actions.test.ts`:

  ```ts
  import { beforeEach, describe, expect, it, vi } from "vitest";

  vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.mock("@/lib/auth/staff", () => ({
    requireStaff: vi.fn(),
    requireSuperAdmin: vi.fn()
  }));
  vi.mock("@/lib/db", () => ({
    db: { insert: vi.fn(), select: vi.fn(), update: vi.fn() },
    assets: {},
    auditEvents: {}
  }));

  import { revalidatePath } from "next/cache";
  import { requireSuperAdmin } from "@/lib/auth/staff";
  import { db } from "@/lib/db";
  import { createAsset } from "@/lib/assets/admin-actions";
  import type { AssetFormInput } from "@/lib/assets/asset-form";

  const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
  const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

  function validInput(overrides: Partial<AssetFormInput> = {}): AssetFormInput {
    return {
      name: "Lisbon Airport Parking",
      city: "Lisbon",
      country: "Portugal",
      siteType: "airport",
      operator: "ParkOperator Lda",
      term: "12 years",
      paymentFrequency: "monthly",
      advisoryCapacityEur: "1500000",
      description: "Busy airport car park next to the terminal.",
      coverImageUrl: "",
      incomeMix: [
        { id: "vehicle_parking", pct: "80" },
        { id: "ev_charging", pct: "20" }
      ],
      standardMinTicketEur: "9900",
      standardYieldPct: "7.7",
      premiumEnabled: false,
      premiumMinTicketEur: "",
      premiumYieldPct: "",
      greenEnabled: false,
      greenMinTicketEur: "",
      greenYieldPct: "",
      ...overrides
    };
  }

  describe("createAsset", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(requireSuperAdmin).mockResolvedValue({
        user: { id: "user-1", email: "admin@example.com" },
        staff: { id: "staff-1", role: "super_admin", ibId: null },
        role: "super_admin"
      });
    });

    it("returns Forbidden when the caller is not a super admin", async () => {
      vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

      const result = await createAsset(validInput());

      expect(result).toEqual({ ok: false, error: "Forbidden." });
      expect(insertMock).not.toHaveBeenCalled();
    });

    it("rejects invalid input without touching the database", async () => {
      const result = await createAsset(validInput({ name: " " }));

      expect(result).toEqual({ ok: false, error: "Name is required." });
      expect(insertMock).not.toHaveBeenCalled();
    });

    it("creates a draft asset and writes the asset.created audit event", async () => {
      const valuesSpy = vi.fn(() => ({
        returning: () => Promise.resolve([{ id: "asset-1" }])
      }));
      insertMock.mockImplementationOnce(() => ({ values: valuesSpy }));
      const auditValues = vi.fn();
      insertMock.mockImplementationOnce(() => ({ values: auditValues }));

      const result = await createAsset(validInput());

      expect(result).toEqual({ ok: true, assetId: "asset-1" });
      expect(valuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "lisbon-airport-parking",
          name: "Lisbon Airport Parking",
          status: "draft",
          targetYieldPct: "7.70",
          minTicketEur: 9900,
          leaseLabel: "12 years"
        })
      );
      expect(auditValues).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: "user-1",
          action: "asset.created",
          entityType: "asset",
          entityId: "asset-1"
        })
      );
      expect(revalidatePath).toHaveBeenCalledWith("/admin/assets");
      expect(revalidatePath).toHaveBeenCalledWith("/opportunities");
    });

    it("maps a slug unique violation to a friendly error", async () => {
      const duplicate = Object.assign(new Error("duplicate key value"), { code: "23505" });
      insertMock.mockImplementationOnce(() => ({
        values: () => ({ returning: () => Promise.reject(duplicate) })
      }));

      const result = await createAsset(validInput());

      expect(result).toEqual({
        ok: false,
        error: "An opportunity with a similar name already exists."
      });
      expect(insertMock).toHaveBeenCalledTimes(1); // no audit insert
    });
  });
  ```

  Run — expect failure (`createAsset is not a function` / not exported):

  ```bash
  npx vitest run tests/asset-admin-actions.test.ts
  ```

- [ ] **Step 4: Implement `createAsset` in `lib/assets/admin-actions.ts`**

  Three edits to `apps/web/lib/assets/admin-actions.ts`:

  1. Replace the import block at the top — before:

     ```ts
     import { eq } from "drizzle-orm";
     import { requireSuperAdmin } from "@/lib/auth/staff";
     import { assets, auditEvents, db } from "@/lib/db";
     import { revalidatePath } from "next/cache";
     import { parseAdvisoryCapacityInput } from "@/lib/assets/advisory-capacity";
     ```

     after:

     ```ts
     import { eq } from "drizzle-orm";
     import { requireSuperAdmin } from "@/lib/auth/staff";
     import { assets, auditEvents, db } from "@/lib/db";
     import { revalidatePath } from "next/cache";
     import { parseAdvisoryCapacityInput } from "@/lib/assets/advisory-capacity";
     import {
       isSafeHttpUrl,
       validateAssetForm,
       type AssetFormInput
     } from "@/lib/assets/asset-form";
     ```

  2. Delete the now-duplicated private `isSafeHttpUrl` function (lines 50-63, `function isSafeHttpUrl(url: string): boolean { ... }`) — it moved to `lib/assets/asset-form.ts` and is imported above.

  3. Append the unique-violation helper (mirrors `lib/leads/admin-actions.ts:34-41`) and the new action at the end of the file:

     ```ts
     function isUniqueViolation(error: unknown): boolean {
       return (
         typeof error === "object" &&
         error !== null &&
         "code" in error &&
         (error as { code?: string }).code === "23505"
       );
     }

     export async function createAsset(
       input: AssetFormInput
     ): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
       let userId: string;
       try {
         const staff = await requireSuperAdmin();
         userId = staff.user.id;
       } catch (error) {
         const message = error instanceof Error ? error.message : "";
         if (message === "UNAUTHENTICATED") return { ok: false, error: "Unauthenticated." };
         return { ok: false, error: "Forbidden." };
       }

       const parsed = validateAssetForm(input);
       if (!parsed.ok) return parsed;

       let inserted: { id: string } | undefined;
       try {
         [inserted] = await db
           .insert(assets)
           .values({ ...parsed.values, status: "draft" })
           .returning({ id: assets.id });
       } catch (error) {
         if (isUniqueViolation(error)) {
           return { ok: false, error: "An opportunity with a similar name already exists." };
         }
         throw error;
       }

       await db.insert(auditEvents).values({
         actorUserId: userId,
         action: "asset.created",
         entityType: "asset",
         entityId: inserted!.id,
         payload: { slug: parsed.values.slug, name: parsed.values.name }
       });

       revalidatePath("/admin/assets");
       revalidatePath("/opportunities");
       revalidatePath("/");
       return { ok: true, assetId: inserted!.id };
     }
     ```

  Run — expect pass (the whole file, including the pre-existing suites):

  ```bash
  npx vitest run tests/asset-admin-actions.test.ts lib/assets/asset-form.test.ts
  ```

- [ ] **Step 5: Build the form component, the `/admin/assets/new` page, and wire the list page**

  Create `apps/web/components/asset-form.tsx` (shared by Task 8's edit page):

  ```tsx
  "use client";

  import { useState, useTransition } from "react";
  import { useRouter } from "next/navigation";
  import { createAsset } from "@/lib/assets/admin-actions";
  import { INCOME_STREAM_IDS, INCOME_STREAM_LABELS } from "@/lib/assets/income-streams";
  import { supportsGreenOption } from "@/lib/assets/investment-options";
  import { SITE_TYPE_OPTIONS, type AssetFormInput } from "@/lib/assets/asset-form";

  function inputFromForm(fd: FormData): AssetFormInput {
    return {
      name: String(fd.get("name") ?? ""),
      city: String(fd.get("city") ?? ""),
      country: String(fd.get("country") ?? ""),
      siteType: String(fd.get("siteType") ?? ""),
      operator: String(fd.get("operator") ?? ""),
      term: String(fd.get("term") ?? ""),
      paymentFrequency: String(fd.get("paymentFrequency") ?? ""),
      advisoryCapacityEur: String(fd.get("advisoryCapacityEur") ?? ""),
      description: String(fd.get("description") ?? ""),
      coverImageUrl: String(fd.get("coverImageUrl") ?? ""),
      incomeMix: INCOME_STREAM_IDS.map((id) => ({
        id,
        pct: String(fd.get(`mix_${id}`) ?? "")
      })),
      standardMinTicketEur: String(fd.get("standardMinTicketEur") ?? ""),
      standardYieldPct: String(fd.get("standardYieldPct") ?? ""),
      premiumEnabled: fd.get("premiumEnabled") === "on",
      premiumMinTicketEur: String(fd.get("premiumMinTicketEur") ?? ""),
      premiumYieldPct: String(fd.get("premiumYieldPct") ?? ""),
      greenEnabled: fd.get("greenEnabled") === "on",
      greenMinTicketEur: String(fd.get("greenMinTicketEur") ?? ""),
      greenYieldPct: String(fd.get("greenYieldPct") ?? "")
    };
  }

  export function AssetForm({ initial }: { initial: AssetFormInput }) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [mixPcts, setMixPcts] = useState<Record<string, string>>(() =>
      Object.fromEntries(initial.incomeMix.map((entry) => [entry.id, entry.pct]))
    );
    const [premiumOn, setPremiumOn] = useState(initial.premiumEnabled);
    const [greenOn, setGreenOn] = useState(initial.greenEnabled);

    const greenEligible = supportsGreenOption(
      INCOME_STREAM_IDS.map((id) => ({ id, pct: Number(mixPcts[id] ?? "") || 0 })).filter(
        (entry) => entry.pct > 0
      )
    );

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setError(null);
      const input = inputFromForm(new FormData(event.currentTarget));
      startTransition(async () => {
        const result = await createAsset(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push("/admin/assets");
        router.refresh();
      });
    }

    return (
      <form className="admin-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Name</span>
          <input name="name" type="text" defaultValue={initial.name} required />
        </label>
        <label className="form-field">
          <span>City</span>
          <input name="city" type="text" defaultValue={initial.city} required />
        </label>
        <label className="form-field">
          <span>Country</span>
          <input name="country" type="text" defaultValue={initial.country} required />
        </label>
        <label className="form-field">
          <span>Site type</span>
          <select name="siteType" defaultValue={initial.siteType}>
            <option value="">Not specified</option>
            {SITE_TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Operator</span>
          <input name="operator" type="text" defaultValue={initial.operator} required />
        </label>
        <label className="form-field">
          <span>Term</span>
          <input
            name="term"
            type="text"
            defaultValue={initial.term}
            placeholder='e.g. "12 years"'
            required
          />
        </label>
        <label className="form-field">
          <span>Target payment frequency</span>
          <select name="paymentFrequency" defaultValue={initial.paymentFrequency}>
            <option value="monthly">Monthly</option>
            <option value="other">Other / see deal documents</option>
          </select>
        </label>
        <label className="form-field">
          <span>Advisory capacity (€)</span>
          <input
            name="advisoryCapacityEur"
            type="text"
            inputMode="numeric"
            defaultValue={initial.advisoryCapacityEur}
            placeholder="e.g. 1500000"
          />
        </label>
        <p className="field-hint">Used for funding % on the consumer site. Blank clears.</p>
        <label className="form-field">
          <span>Description</span>
          <textarea name="description" rows={4} defaultValue={initial.description} required />
        </label>
        <label className="form-field">
          <span>Cover image URL</span>
          <input
            name="coverImageUrl"
            type="text"
            defaultValue={initial.coverImageUrl}
            placeholder="https://… or /site/path"
          />
        </label>

        <fieldset className="form-field">
          <legend>Income mix (%)</legend>
          <p className="field-hint">
            Must sum to 100, with vehicle parking the largest stream.
          </p>
          {INCOME_STREAM_IDS.map((id) => (
            <label className="form-field" key={id}>
              <span>{INCOME_STREAM_LABELS[id]}</span>
              <input
                name={`mix_${id}`}
                type="text"
                inputMode="decimal"
                value={mixPcts[id] ?? ""}
                onChange={(event) =>
                  setMixPcts((prev) => ({ ...prev, [id]: event.target.value }))
                }
              />
            </label>
          ))}
        </fieldset>

        <fieldset className="form-field">
          <legend>Standard option (required)</legend>
          <label className="form-field">
            <span>Minimum ticket (€)</span>
            <input
              name="standardMinTicketEur"
              type="text"
              inputMode="numeric"
              defaultValue={initial.standardMinTicketEur}
              required
            />
          </label>
          <label className="form-field">
            <span>Target yield (%)</span>
            <input
              name="standardYieldPct"
              type="text"
              inputMode="decimal"
              defaultValue={initial.standardYieldPct}
              required
            />
          </label>
        </fieldset>

        <fieldset className="form-field">
          <legend>
            <label>
              <input
                type="checkbox"
                name="premiumEnabled"
                checked={premiumOn}
                onChange={(event) => setPremiumOn(event.target.checked)}
              />{" "}
              Add Premium option
            </label>
          </legend>
          {premiumOn ? (
            <>
              <label className="form-field">
                <span>Minimum ticket (€)</span>
                <input
                  name="premiumMinTicketEur"
                  type="text"
                  inputMode="numeric"
                  defaultValue={initial.premiumMinTicketEur}
                />
              </label>
              <label className="form-field">
                <span>Target yield (%) — must be ≥ Standard</span>
                <input
                  name="premiumYieldPct"
                  type="text"
                  inputMode="decimal"
                  defaultValue={initial.premiumYieldPct}
                />
              </label>
            </>
          ) : null}
        </fieldset>

        {greenEligible ? (
          <fieldset className="form-field">
            <legend>
              <label>
                <input
                  type="checkbox"
                  name="greenEnabled"
                  checked={greenOn}
                  onChange={(event) => setGreenOn(event.target.checked)}
                />{" "}
                Add EV option
              </label>
            </legend>
            {greenOn ? (
              <>
                <label className="form-field">
                  <span>Minimum ticket (€)</span>
                  <input
                    name="greenMinTicketEur"
                    type="text"
                    inputMode="numeric"
                    defaultValue={initial.greenMinTicketEur}
                  />
                </label>
                <label className="form-field">
                  <span>Target yield (%) — must be ≥ Standard/Premium</span>
                  <input
                    name="greenYieldPct"
                    type="text"
                    inputMode="decimal"
                    defaultValue={initial.greenYieldPct}
                  />
                </label>
              </>
            ) : null}
          </fieldset>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Create draft opportunity"}
        </button>
      </form>
    );
  }
  ```

  The component is create-only here; Task 8 extends it with `mode`/`assetId` props and the `updateDraftAsset` branch (exact edits there) so this task's deliverable verifies independently.

  Create `apps/web/app/admin/assets/new/page.tsx`:

  ```tsx
  import { redirect } from "next/navigation";
  import { requireSuperAdmin } from "@/lib/auth/staff";
  import { emptyAssetFormInput } from "@/lib/assets/asset-form";
  import { AdminPageHeader } from "@/components/admin/admin-page-header";
  import { AssetForm } from "@/components/asset-form";

  export const dynamic = "force-dynamic";

  export default async function NewAssetPage() {
    try {
      await requireSuperAdmin();
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
      throw error;
    }

    return (
      <div className="admin-page">
        <AdminPageHeader
          title="New opportunity"
          subtitle="Creates a draft. Publish it from the assets list when the content is ready."
        />
        <AssetForm initial={emptyAssetFormInput()} />
      </div>
    );
  }
  ```

  Create `apps/web/lib/assets/labels.ts` (standard E: no raw enum strings):

  ```ts
  /** Friendly labels for asset status values in admin UI. */
  export const ASSET_STATUS_LABEL: Record<string, string> = {
    draft: "Draft",
    published: "Published",
    closed: "Closed"
  };
  ```

  Append one rule to `apps/web/app/globals.css` (next to the other admin rules, e.g. after `.admin-page-actions` at line 1951) — no suitable existing form class (`onboarding-form` is onboarding-specific, `admin-filter-form` is a horizontal filter bar):

  ```css
  .admin-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 640px;
  }
  ```

  Edit `apps/web/app/admin/assets/page.tsx` — three changes:

  1. Import block — before:

     ```tsx
     import { redirect } from "next/navigation";
     import { requireSuperAdmin } from "@/lib/auth/staff";
     ```

     after:

     ```tsx
     import Link from "next/link";
     import { redirect } from "next/navigation";
     import { requireSuperAdmin } from "@/lib/auth/staff";
     import { ASSET_STATUS_LABEL } from "@/lib/assets/labels";
     ```

  2. Header — before:

     ```tsx
           <AdminPageHeader
             title="Assets"
             subtitle="Publish catalogue assets, set advisory raise capacity for funding bars, and attach optional cover or gallery image URLs."
           />
     ```

     after:

     ```tsx
           <AdminPageHeader
             title="Assets"
             subtitle="Publish catalogue assets, set advisory raise capacity for funding bars, and attach optional cover or gallery image URLs."
             actions={
               <Link className="btn btn-primary" href="/admin/assets/new">
                 New opportunity
               </Link>
             }
           />
     ```

  3. Status cell — before:

     ```tsx
                     <td>{a.status}</td>
     ```

     after:

     ```tsx
                     <td>{ASSET_STATUS_LABEL[a.status] ?? a.status}</td>
     ```

  Verify (markup-only changes; no forced component test per repo convention):

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/asset-form.ts apps/web/lib/assets/asset-form.test.ts \
    apps/web/lib/assets/admin-actions.ts apps/web/tests/asset-admin-actions.test.ts \
    apps/web/lib/assets/labels.ts apps/web/components/asset-form.tsx \
    apps/web/app/admin/assets/new/page.tsx apps/web/app/admin/assets/page.tsx \
    apps/web/app/globals.css
  git commit -m "feat(admin): super-admin create-opportunity flow reusing catalogue invariants"
  ```

---

### Task 8: Edit-draft flow (prefilled form, drafts only)

The same `AssetForm` prefilled via a pure `assetToFormInput` mapper, served at `/admin/assets/[id]/edit` for `draft` assets only. `updateDraftAsset` re-runs full catalogue validation, writes `asset.updated`, and refuses non-draft assets; published assets remain status-managed only (the list page shows the Edit button only on draft rows, and the action is the hard gate).

**Files:**
- Modify: `apps/web/lib/assets/asset-form.ts`
- Test: `apps/web/lib/assets/asset-form.test.ts`
- Modify: `apps/web/lib/assets/admin-actions.ts`
- Test: `apps/web/tests/asset-admin-actions.test.ts`
- Create: `apps/web/app/admin/assets/[id]/edit/page.tsx`
- Modify: `apps/web/components/asset-form.tsx`
- Modify: `apps/web/app/admin/assets/new/page.tsx` (pass `mode="create"`)
- Modify: `apps/web/app/admin/assets/page.tsx`

**Interfaces:**
- Consumes (from Task 7): `AssetFormInput`, `ValidatedAssetForm`, `validateAssetForm`, `AssetForm` component, `isUniqueViolation` pattern and the `{ ok, error }` / `requireSuperAdmin` / audit conventions in `lib/assets/admin-actions.ts`.
- Produces:
  - `assetToFormInput(asset: Asset): AssetFormInput` (`lib/assets/asset-form.ts`)
  - `updateDraftAsset(input: { assetId: string; form: AssetFormInput }): Promise<{ ok: true } | { ok: false; error: string }>` — writes `asset.updated` audit event

- [ ] **Step 1: Write the failing test for `assetToFormInput`**

  Append to `apps/web/lib/assets/asset-form.test.ts` (extend the import from `@/lib/assets/asset-form` with `assetToFormInput`, and add `import type { Asset } from "@/lib/assets";`):

  ```ts
  describe("assetToFormInput", () => {
    const asset = {
      id: "asset-1",
      slug: "lisbon-airport-parking",
      name: "Lisbon Airport Parking",
      operator: "ParkOperator Lda",
      city: "Lisbon",
      district: "Lisbon",
      country: "Portugal",
      targetYieldPct: "7.70",
      tier: "Standard",
      minTicketEur: 9900,
      spaces: 0,
      occupancyPct: "0.00",
      leaseLabel: "12 years",
      blurb: "Busy airport car park next to the terminal.",
      status: "draft",
      advisoryCapacityEur: 1500000,
      artVariant: 0,
      incomeMix: [
        { id: "vehicle_parking", pct: 80 },
        { id: "ev_charging", pct: 20 }
      ],
      visitorsPerDay: null,
      visitorsProvenance: "withheld",
      availableSpaces: null,
      annualRevenueEur: null,
      revenueProvenance: "withheld",
      commercialTermIds: [
        "triple_net",
        "contractual_monthly_rent",
        "indexation_floor",
        "parkwise_protections",
        "flexible_term"
      ],
      investmentOptions: [
        {
          id: "standard",
          label: "Standard option",
          recommended: true,
          minTicketEur: 9900,
          yieldPct: 7.7,
          monthlyIncomeEur: 64,
          annualIncomeEur: 762,
          commercialTermIds: []
        },
        {
          id: "green",
          label: "EV option",
          recommended: false,
          minTicketEur: 15000,
          yieldPct: 8.5,
          monthlyIncomeEur: 106,
          annualIncomeEur: 1275,
          commercialTermIds: []
        }
      ],
      operatorDisplay: null,
      siteType: "airport",
      coverImageUrl: "https://images.example.com/lisbon.jpg",
      galleryImageUrls: [],
      createdAt: new Date("2026-07-23T00:00:00Z"),
      updatedAt: new Date("2026-07-23T00:00:00Z")
    } as unknown as Asset;

    it("maps a draft asset back to raw form inputs", () => {
      const input = assetToFormInput(asset);
      expect(input.name).toBe("Lisbon Airport Parking");
      expect(input.term).toBe("12 years");
      expect(input.paymentFrequency).toBe("monthly");
      expect(input.advisoryCapacityEur).toBe("1500000");
      expect(input.description).toContain("airport car park");
      expect(input.coverImageUrl).toBe("https://images.example.com/lisbon.jpg");
      expect(input.incomeMix).toEqual([
        { id: "vehicle_parking", pct: "80" },
        { id: "ev_charging", pct: "20" }
      ]);
      expect(input.standardMinTicketEur).toBe("9900");
      expect(input.standardYieldPct).toBe("7.7");
      expect(input.premiumEnabled).toBe(false);
      expect(input.greenEnabled).toBe(true);
      expect(input.greenMinTicketEur).toBe("15000");
      expect(input.greenYieldPct).toBe("8.5");
    });

    it("round-trips through validateAssetForm", () => {
      const result = validateAssetForm(assetToFormInput(asset));
      expect(result.ok).toBe(true);
    });

    it("maps non-monthly assets to the other frequency", () => {
      const other = {
        ...asset,
        commercialTermIds: asset.commercialTermIds.filter(
          (id: string) => id !== "contractual_monthly_rent"
        )
      } as unknown as Asset;
      expect(assetToFormInput(other).paymentFrequency).toBe("other");
    });
  });
  ```

  Run — expect failure (`assetToFormInput is not a function`):

  ```bash
  npx vitest run lib/assets/asset-form.test.ts
  ```

- [ ] **Step 2: Implement `assetToFormInput`**

  Append to `apps/web/lib/assets/asset-form.ts` (and add `import type { Asset } from "@/lib/assets";` to its import block — type-only, so no client-bundle or cycle concerns):

  ```ts
  /** Prefill mapping for the edit-draft form: DB row back to raw form inputs. */
  export function assetToFormInput(asset: Asset): AssetFormInput {
    const options = asset.investmentOptions ?? [];
    const standard = options.find((o) => o.id === "standard");
    const premium = options.find((o) => o.id === "premium");
    const green = options.find((o) => o.id === "green");
    return {
      name: asset.name,
      city: asset.city,
      country: asset.country,
      siteType: asset.siteType ?? "",
      operator: asset.operator,
      term: asset.leaseLabel,
      paymentFrequency: asset.commercialTermIds.includes("contractual_monthly_rent")
        ? "monthly"
        : "other",
      advisoryCapacityEur:
        asset.advisoryCapacityEur != null ? String(asset.advisoryCapacityEur) : "",
      description: asset.blurb,
      coverImageUrl: asset.coverImageUrl ?? "",
      incomeMix: asset.incomeMix.map((entry) => ({ id: entry.id, pct: String(entry.pct) })),
      standardMinTicketEur: standard ? String(standard.minTicketEur) : "",
      standardYieldPct: standard ? String(standard.yieldPct) : "",
      premiumEnabled: Boolean(premium),
      premiumMinTicketEur: premium ? String(premium.minTicketEur) : "",
      premiumYieldPct: premium ? String(premium.yieldPct) : "",
      greenEnabled: Boolean(green),
      greenMinTicketEur: green ? String(green.minTicketEur) : "",
      greenYieldPct: green ? String(green.yieldPct) : ""
    };
  }
  ```

  Run — expect pass:

  ```bash
  npx vitest run lib/assets/asset-form.test.ts
  ```

- [ ] **Step 3: Write the failing `updateDraftAsset` action tests, then implement the action**

  Append to `apps/web/tests/asset-admin-actions.test.ts` (extend the action import to `import { createAsset, updateDraftAsset } from "@/lib/assets/admin-actions";`, add `const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;` next to the other mock aliases, and reuse the `validInput` helper already in the file):

  ```ts
  /** Queue one db.select chain resolving to `rows`. */
  function mockSelect(rows: unknown) {
    selectMock.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) })
    }));
  }

  describe("updateDraftAsset", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(requireSuperAdmin).mockResolvedValue({
        user: { id: "user-1", email: "admin@example.com" },
        staff: { id: "staff-1", role: "super_admin", ibId: null },
        role: "super_admin"
      });
    });

    it("returns Forbidden when the caller is not a super admin", async () => {
      vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

      const result = await updateDraftAsset({ assetId: "asset-1", form: validInput() });

      expect(result).toEqual({ ok: false, error: "Forbidden." });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("returns an error when the asset does not exist", async () => {
      mockSelect([]);

      const result = await updateDraftAsset({ assetId: "missing", form: validInput() });

      expect(result).toEqual({ ok: false, error: "Asset not found." });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("refuses to edit a published asset", async () => {
      mockSelect([{ id: "asset-1", status: "published", slug: "lisbon-airport-parking" }]);

      const result = await updateDraftAsset({ assetId: "asset-1", form: validInput() });

      expect(result).toEqual({
        ok: false,
        error: "Only draft opportunities can be edited."
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("rejects invalid input without updating", async () => {
      mockSelect([{ id: "asset-1", status: "draft", slug: "lisbon-airport-parking" }]);

      const result = await updateDraftAsset({
        assetId: "asset-1",
        form: validInput({ name: " " })
      });

      expect(result).toEqual({ ok: false, error: "Name is required." });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("updates the draft and writes the asset.updated audit event", async () => {
      mockSelect([{ id: "asset-1", status: "draft", slug: "lisbon-airport-parking" }]);
      const setSpy = vi.fn(() => ({ where: () => Promise.resolve(undefined) }));
      updateMock.mockImplementationOnce(() => ({ set: setSpy }));
      const auditValues = vi.fn();
      insertMock.mockImplementationOnce(() => ({ values: auditValues }));

      const result = await updateDraftAsset({
        assetId: "asset-1",
        form: validInput({ name: "Lisbon Airport Parking — Terminal 2" })
      });

      expect(result).toEqual({ ok: true });
      expect(setSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Lisbon Airport Parking — Terminal 2",
          leaseLabel: "12 years"
        })
      );
      // Slug is identity: a rename must not rewrite it.
      expect(setSpy.mock.calls[0]![0]).not.toHaveProperty("slug");
      expect(auditValues).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: "user-1",
          action: "asset.updated",
          entityType: "asset",
          entityId: "asset-1"
        })
      );
      expect(revalidatePath).toHaveBeenCalledWith("/admin/assets");
      expect(revalidatePath).toHaveBeenCalledWith("/opportunities/lisbon-airport-parking");
    });
  });
  ```

  Run — expect failure (`updateDraftAsset is not a function`):

  ```bash
  npx vitest run tests/asset-admin-actions.test.ts
  ```

  Then append the action to `apps/web/lib/assets/admin-actions.ts` (after `createAsset`; no new imports needed beyond `validateAssetForm` / `AssetFormInput` added in Task 7):

  ```ts
  export async function updateDraftAsset(input: {
    assetId: string;
    form: AssetFormInput;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    let userId: string;
    try {
      const staff = await requireSuperAdmin();
      userId = staff.user.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "UNAUTHENTICATED") return { ok: false, error: "Unauthenticated." };
      return { ok: false, error: "Forbidden." };
    }

    const [existing] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, input.assetId))
      .limit(1);
    if (!existing) return { ok: false, error: "Asset not found." };
    if (existing.status !== "draft") {
      return { ok: false, error: "Only draft opportunities can be edited." };
    }

    const parsed = validateAssetForm(input.form);
    if (!parsed.ok) return parsed;

    // Slug is identity (consumer URLs); a rename does not rewrite it.
    const { slug: _slug, ...updateValues } = parsed.values;
    await db
      .update(assets)
      .set({ ...updateValues, updatedAt: new Date() })
      .where(eq(assets.id, input.assetId));

    await db.insert(auditEvents).values({
      actorUserId: userId,
      action: "asset.updated",
      entityType: "asset",
      entityId: input.assetId,
      payload: { slug: existing.slug, name: parsed.values.name }
    });

    revalidatePath("/admin/assets");
    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${existing.slug}`);
    revalidatePath("/");
    return { ok: true };
  }
  ```

  Run — expect pass:

  ```bash
  npx vitest run tests/asset-admin-actions.test.ts lib/assets/asset-form.test.ts
  ```

- [ ] **Step 4: Extend `AssetForm` for edit mode, create the edit page, and gate the list-page Edit button to drafts**

  Edit `apps/web/components/asset-form.tsx` — three changes:

  1. Action import — before:

     ```tsx
     import { createAsset } from "@/lib/assets/admin-actions";
     ```

     after:

     ```tsx
     import { createAsset, updateDraftAsset } from "@/lib/assets/admin-actions";
     ```

  2. Props — before:

     ```tsx
     export function AssetForm({ initial }: { initial: AssetFormInput }) {
     ```

     after:

     ```tsx
     export function AssetForm({
       mode,
       assetId,
       initial
     }: {
       mode: "create" | "edit";
       assetId?: string;
       initial: AssetFormInput;
     }) {
     ```

  3. Submit branch and button label — before:

     ```tsx
         startTransition(async () => {
           const result = await createAsset(input);
     ```

     after:

     ```tsx
         startTransition(async () => {
           const result =
             mode === "create"
               ? await createAsset(input)
               : await updateDraftAsset({ assetId: assetId!, form: input });
     ```

     and — before:

     ```tsx
           <button className="btn btn-primary" type="submit" disabled={isPending}>
             {isPending ? "Saving…" : "Create draft opportunity"}
           </button>
     ```

     after:

     ```tsx
           <button className="btn btn-primary" type="submit" disabled={isPending}>
             {isPending
               ? "Saving…"
               : mode === "create"
                 ? "Create draft opportunity"
                 : "Save draft"}
           </button>
     ```

  Also update the create page `apps/web/app/admin/assets/new/page.tsx` — before:

  ```tsx
        <AssetForm initial={emptyAssetFormInput()} />
  ```

  after:

  ```tsx
        <AssetForm mode="create" initial={emptyAssetFormInput()} />
  ```

  Create `apps/web/app/admin/assets/[id]/edit/page.tsx`:

  ```tsx
  import { eq } from "drizzle-orm";
  import { notFound, redirect } from "next/navigation";
  import { requireSuperAdmin } from "@/lib/auth/staff";
  import { assets, db } from "@/lib/db";
  import { assetToFormInput } from "@/lib/assets/asset-form";
  import { AdminPageHeader } from "@/components/admin/admin-page-header";
  import { AssetForm } from "@/components/asset-form";

  export const dynamic = "force-dynamic";

  export default async function EditAssetPage({
    params
  }: {
    params: Promise<{ id: string }>;
  }) {
    try {
      await requireSuperAdmin();
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
      throw error;
    }

    const { id } = await params;
    const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
    if (!asset) notFound();
    // Published assets stay status-managed only (spec C.2).
    if (asset.status !== "draft") redirect("/admin/assets");

    return (
      <div className="admin-page">
        <AdminPageHeader
          title={`Edit ${asset.name}`}
          subtitle="Draft opportunity — publish it from the assets list when the content is ready."
        />
        <AssetForm mode="edit" assetId={asset.id} initial={assetToFormInput(asset)} />
      </div>
    );
  }
  ```

  Edit `apps/web/app/admin/assets/page.tsx` — Actions cell. Before:

  ```tsx
                <td>
                  <AssetStatusActions assetId={a.id} status={a.status} />
                </td>
  ```

  After:

  ```tsx
                <td>
                  <AssetStatusActions assetId={a.id} status={a.status} />
                  {a.status === "draft" ? (
                    <Link className="btn btn-ghost btn-sm" href={`/admin/assets/${a.id}/edit`}>
                      Edit
                    </Link>
                  ) : null}
                </td>
  ```

  (`Link` is already imported from Task 7 Step 5.)

  Verify (markup-only changes):

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/asset-form.ts apps/web/lib/assets/asset-form.test.ts \
    apps/web/lib/assets/admin-actions.ts apps/web/tests/asset-admin-actions.test.ts \
    "apps/web/app/admin/assets/[id]/edit/page.tsx" apps/web/app/admin/assets/page.tsx \
    apps/web/components/asset-form.tsx apps/web/app/admin/assets/new/page.tsx
  git commit -m "feat(admin): edit draft opportunities with prefilled validated form"
  ```

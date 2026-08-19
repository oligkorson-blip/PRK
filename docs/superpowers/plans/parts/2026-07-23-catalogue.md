# Area 2 — Opportunity catalogue (Tasks 19–24)

Spec: `docs/superpowers/specs/2026-07-23-assisted-kyc-and-flow-fixes-design.md`, "Area 2: Opportunity catalogue" (findings 1–9).

Scope notes discovered while reading the code (relevant for assembly):

- The catalogue component lives at `apps/web/app/opportunities/opportunities-catalogue.tsx` (a client component colocated with the page), **not** `components/opportunities-catalogue.tsx` as the assignment assumed. All task steps below use the real path.
- The default sort is already neutral (`parseSort` in the catalogue falls back to `"name_asc"`). Task 24 locks this with a test instead of changing behavior.
- The `recommended` flag is still consumed by `findOption` (`lib/assets/investment-options.ts:192`), `resolveMinTicket` (`lib/assets/presentation.ts:131`), and the catalogue sort/filter fallbacks — so per the spec's "internal-only (or dropped if nothing consumes it)" it is **kept in validation** and marked internal-only with a doc comment, not dropped.
- There is no component-render test infrastructure (no `@testing-library` in `apps/web/package.json`; all tests are pure-function vitest). Behavior changes are funneled into pure helpers in `lib/` with real vitest coverage; pure markup/copy edits get exact before/after edits plus `tsc`/`vitest`/`build` verification steps.

Common setup for every command (from the repo root unless noted):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"
cd /Users/mac/Documents/Park/apps/web
```

---

### Task 19: Replace "Recommended" badge with factual derived labels

Finding 1. The badge at `apps/web/components/opportunity-detail-returns.tsx:66-68` currently renders:

```tsx
{opt.recommended ? (
  <span className="badge badge-soft">Recommended</span>
) : null}
```

Replace it with labels derived from the option data ("Lowest minimum" / "Highest target"), computed by a new pure helper in `lib/assets/investment-options.ts`, and mark the `recommended` flag internal-only.

**Files:**
- Modify: `apps/web/lib/assets/investment-options.ts`
- Modify: `apps/web/components/opportunity-detail-returns.tsx`
- Test: `apps/web/lib/assets/investment-options.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task in this section).
- Produces:
  - `optionDerivedLabels(options: InvestmentOption[]): Map<InvestmentOptionId, OptionDerivedLabel[]>` — used by `components/opportunity-detail-returns.tsx` (this task) and available to later tasks.
  - `type OptionDerivedLabel = "Lowest minimum" | "Highest target"`

- [ ] **Step 1: Write the failing test**

  Append to `apps/web/lib/assets/investment-options.test.ts` (extend the existing import from `@/lib/assets/investment-options` with `optionDerivedLabels` and `type InvestmentOption`):

  ```ts
  describe("optionDerivedLabels", () => {
    const standard: InvestmentOption = {
      id: "standard",
      label: "Standard option",
      recommended: true,
      minTicketEur: 10000,
      yieldPct: 8,
      monthlyIncomeEur: 67,
      annualIncomeEur: 800,
      commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
    };
    const premium: InvestmentOption = {
      id: "premium",
      label: "Premium option",
      recommended: false,
      minTicketEur: 25000,
      yieldPct: 9.5,
      monthlyIncomeEur: 198,
      annualIncomeEur: 2375,
      commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
    };

    it("labels the lowest minimum and the highest target", () => {
      const labels = optionDerivedLabels([standard, premium]);
      expect(labels.get("standard")).toEqual(["Lowest minimum"]);
      expect(labels.get("premium")).toEqual(["Highest target"]);
    });

    it("gives a single option both labels", () => {
      const labels = optionDerivedLabels([standard]);
      expect(labels.get("standard")).toEqual(["Lowest minimum", "Highest target"]);
    });

    it("returns an empty map for no options", () => {
      expect(optionDerivedLabels([]).size).toBe(0);
    });
  });
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/investment-options.test.ts
  ```

  Expected: FAIL — `TypeError: optionDerivedLabels is not a function`.

- [ ] **Step 3: Implement `optionDerivedLabels` and mark `recommended` internal-only**

  In `apps/web/lib/assets/investment-options.ts`, change the `recommended` field doc in the `InvestmentOption` type:

  ```ts
  export type InvestmentOption = {
    id: InvestmentOptionId;
    label: string;
    /**
     * Internal-only selection default. Consumed by `findOption`, the
     * presentation min-ticket fallback, and catalogue sort/filter defaults.
     * Never render as a user-facing "Recommended" claim — display the
     * factual labels from `optionDerivedLabels` instead.
     */
    recommended: boolean;
    minTicketEur: number;
    yieldPct: number;
    monthlyIncomeEur: number;
    annualIncomeEur: number;
    commercialTermIds: CommercialTermId[];
  };
  ```

  (Validation of `recommended` stays exactly as-is — `validateInvestmentOption` still requires the boolean and `validateInvestmentOptions` still requires exactly one recommended option, because the consumers above still need it.)

  Add after `formatYieldBand` (before `findOption`):

  ```ts
  export type OptionDerivedLabel = "Lowest minimum" | "Highest target";

  /**
   * Factual per-option labels derived from the option set — replaces the old
   * editorial "Recommended" badge. Ties resolve to the first option in array
   * order; a single-option set gets both labels.
   */
  export function optionDerivedLabels(
    options: InvestmentOption[]
  ): Map<InvestmentOptionId, OptionDerivedLabel[]> {
    const labels = new Map<InvestmentOptionId, OptionDerivedLabel[]>();
    if (options.length === 0) return labels;

    let lowest = options[0]!;
    let highest = options[0]!;
    for (const opt of options) {
      if (opt.minTicketEur < lowest.minTicketEur) lowest = opt;
      if (opt.yieldPct > highest.yieldPct) highest = opt;
    }
    labels.set(lowest.id, [...(labels.get(lowest.id) ?? []), "Lowest minimum"]);
    labels.set(highest.id, [...(labels.get(highest.id) ?? []), "Highest target"]);
    return labels;
  }
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/investment-options.test.ts
  ```

  Expected: PASS (all existing + 3 new tests).

- [ ] **Step 5: Swap the badge in the detail returns component**

  In `apps/web/components/opportunity-detail-returns.tsx`:

  Change the import:

  ```ts
  import {
    optionAnnualIncome,
    optionDerivedLabels,
    optionMonthlyIncome,
    type InvestmentOption
  } from "@/lib/assets/investment-options";
  ```

  Inside the component, before the `return` (after the `illusMonthly` line), add:

  ```ts
  const derivedLabels = optionDerivedLabels(options);
  ```

  Replace the badge block:

  ```tsx
  {opt.recommended ? (
    <span className="badge badge-soft">Recommended</span>
  ) : null}
  ```

  with:

  ```tsx
  {(derivedLabels.get(opt.id) ?? []).map((label) => (
    <span key={label} className="badge badge-soft">
      {label}
    </span>
  ))}
  ```

- [ ] **Step 6: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  grep -rn "Recommended" components/ app/opportunities/ lib/assets/
  ```

  Expected: tsc clean, all tests pass, and the grep shows no remaining user-facing "Recommended" string (the `recommended` field name in `lib/assets/investment-options.ts` is fine; only the display string must be gone).

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/investment-options.ts apps/web/lib/assets/investment-options.test.ts apps/web/components/opportunity-detail-returns.tsx
  git commit -m "catalogue: replace Recommended badge with derived Lowest minimum / Highest target labels"
  ```

---

### Task 20: "Key terms" summary section on the detail page

Finding 2. New section built from `lib/assets/commercial-terms.ts` labels plus the existing presentation values (`termDisplay`, `paymentFrequencyDisplay`, `minTicketDisplay`). No new documents, no new data — the existing `COMMERCIAL_TERM_LABELS` / `COMMERCIAL_TERM_NOT_MEANING` records are the source for the structure row. Rendered in `components/opportunity-detail-client.tsx` between the operator section and the returns section. `DETAIL_NAV` is left unchanged (no new jump-link; keeps the diff minimal).

**Files:**
- Modify: `apps/web/lib/assets/commercial-terms.ts`
- Create: `apps/web/components/opportunity-detail-key-terms.tsx`
- Modify: `apps/web/components/opportunity-detail-client.tsx`
- Test: `apps/web/lib/assets/commercial-terms.test.ts` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `keyTermsStructureSummary(termIds: CommercialTermId[]): string` (in `lib/assets/commercial-terms.ts`)
  - `OpportunityDetailKeyTerms({ termIds, minTicketDisplay, paymentFrequencyDisplay, termDisplay }: { termIds: CommercialTermId[]; minTicketDisplay: string | null; paymentFrequencyDisplay: string; termDisplay: string }): JSX.Element`

- [ ] **Step 1: Write the failing test**

  Create `apps/web/lib/assets/commercial-terms.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    COMMERCIAL_TERM_IDS,
    COMMERCIAL_TERM_LABELS,
    COMMERCIAL_TERM_NOT_MEANING,
    DEFAULT_COMMERCIAL_TERM_IDS,
    keyTermsStructureSummary
  } from "@/lib/assets/commercial-terms";

  describe("commercial terms catalogue", () => {
    it("has a label and not-meaning line for every term id", () => {
      for (const id of COMMERCIAL_TERM_IDS) {
        expect(COMMERCIAL_TERM_LABELS[id].length).toBeGreaterThan(0);
        expect(COMMERCIAL_TERM_NOT_MEANING[id].length).toBeGreaterThan(0);
      }
    });

    it("joins term labels for the Key terms structure row", () => {
      const summary = keyTermsStructureSummary(DEFAULT_COMMERCIAL_TERM_IDS);
      expect(summary).toBe(
        "Operator lease structure · Target income from operator rent · " +
          "Indexation where stated in the lease · Investor protections in the deal terms · " +
          "Flexible terms where offered"
      );
    });

    it("returns an empty string for no terms", () => {
      expect(keyTermsStructureSummary([])).toBe("");
    });
  });
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/commercial-terms.test.ts
  ```

  Expected: FAIL — `keyTermsStructureSummary` is not exported.

- [ ] **Step 3: Implement the helper**

  In `apps/web/lib/assets/commercial-terms.ts`, append:

  ```ts
  /** Joined "A · B · C" structure summary for the detail-page Key terms block. */
  export function keyTermsStructureSummary(termIds: CommercialTermId[]): string {
    return termIds.map((id) => COMMERCIAL_TERM_LABELS[id]).join(" · ");
  }
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/commercial-terms.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Create the component**

  Create `apps/web/components/opportunity-detail-key-terms.tsx` (`.option-card-metrics` is a standalone class in `app/globals.css:2042`, safe to reuse outside option cards):

  ```tsx
  import {
    keyTermsStructureSummary,
    type CommercialTermId
  } from "@/lib/assets/commercial-terms";

  export function OpportunityDetailKeyTerms({
    termIds,
    minTicketDisplay,
    paymentFrequencyDisplay,
    termDisplay
  }: {
    termIds: CommercialTermId[];
    minTicketDisplay: string | null;
    paymentFrequencyDisplay: string;
    termDisplay: string;
  }) {
    return (
      <section id="key-terms" className="detail-block">
        <h2 className="h3">Key terms</h2>
        <dl className="option-card-metrics">
          <div>
            <dt>Structure</dt>
            <dd>{keyTermsStructureSummary(termIds)}</dd>
          </div>
          <div>
            <dt>Minimum investment</dt>
            <dd>{minTicketDisplay ?? "See opportunity details"}</dd>
          </div>
          <div>
            <dt>Target payments</dt>
            <dd>{paymentFrequencyDisplay}</dd>
          </div>
          <div>
            <dt>Target term and exit</dt>
            <dd>{termDisplay}</dd>
          </div>
          <div>
            <dt>Fees</dt>
            <dd>No platform fee; any opportunity costs are in the deal documents</dd>
          </div>
        </dl>
        <p className="field-hint">
          Summary only — the deal documents have the final word on all terms.
        </p>
      </section>
    );
  }
  ```

- [ ] **Step 6: Wire it into the detail client**

  In `apps/web/components/opportunity-detail-client.tsx`:

  Add the import (with the other detail-section imports):

  ```ts
  import { OpportunityDetailKeyTerms } from "@/components/opportunity-detail-key-terms";
  ```

  Render it immediately before `<OpportunityDetailReturns ...>` (the `termIds` const at line 97-99 and `presentation` already hold everything needed):

  ```tsx
  <OpportunityDetailKeyTerms
    termIds={termIds}
    minTicketDisplay={presentation.minTicketDisplay}
    paymentFrequencyDisplay={presentation.paymentFrequencyDisplay}
    termDisplay={presentation.termDisplay}
  />

  <OpportunityDetailReturns
    options={props.options}
    ...
  ```

- [ ] **Step 7: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

  Expected: clean tsc, all tests pass.

- [ ] **Step 8: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/commercial-terms.ts apps/web/lib/assets/commercial-terms.test.ts apps/web/components/opportunity-detail-key-terms.tsx apps/web/components/opportunity-detail-client.tsx
  git commit -m "catalogue: add Key terms summary section to opportunity detail page"
  ```

---

### Task 21: Illustrator downside rows + assumptions note

Finding 3. The income illustrator in `components/opportunity-detail-returns.tsx` currently shows only the at-target monthly/annual figures. Add two adverse-scenario rows (income at 50% of target, and at zero) derived by a pure helper, and extend the assumptions note with a new copy constant covering gross-of-tax / before-costs / target basis.

**Files:**
- Modify: `apps/web/lib/assets/investment-options.ts`
- Modify: `apps/web/lib/copy/consumer.ts`
- Modify: `apps/web/components/opportunity-detail-returns.tsx`
- Test: `apps/web/lib/assets/investment-options.test.ts`
- Test: `apps/web/lib/copy/consumer.test.ts` (new)

**Interfaces:**
- Consumes: `optionAnnualIncome` / `optionMonthlyIncome` (existing), file already touched by Task 19 (apply after it).
- Produces:
  - `illustratorDownsideRows(annualIncomeEur: number): IllustratorDownsideRow[]`
  - `type IllustratorDownsideRow = { id: "half_of_target" | "no_income"; label: string; monthlyEur: number }`
  - `ILLUSTRATION_ASSUMPTIONS: string` (in `lib/copy/consumer.ts`)

- [ ] **Step 1: Write the failing tests**

  Append to `apps/web/lib/assets/investment-options.test.ts` (add `illustratorDownsideRows` to the import from `@/lib/assets/investment-options`):

  ```ts
  describe("illustratorDownsideRows", () => {
    it("halves the target income and floors at zero", () => {
      const rows = illustratorDownsideRows(optionAnnualIncome(10000, 8)); // 800
      expect(rows).toEqual([
        { id: "half_of_target", label: "If income is half of target", monthlyEur: 33 },
        { id: "no_income", label: "If no income is paid", monthlyEur: 0 }
      ]);
    });

    it("rounds via the same monthly helper as the headline figure", () => {
      const rows = illustratorDownsideRows(optionAnnualIncome(11400, 7.8)); // 889
      expect(rows[0]).toEqual({
        id: "half_of_target",
        label: "If income is half of target",
        monthlyEur: 37
      });
    });
  });
  ```

  Create `apps/web/lib/copy/consumer.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { ILLUSTRATION_ASSUMPTIONS } from "@/lib/copy/consumer";

  describe("ILLUSTRATION_ASSUMPTIONS", () => {
    it("states the gross-of-tax, before-costs, target basis", () => {
      expect(ILLUSTRATION_ASSUMPTIONS).toContain("gross of tax");
      expect(ILLUSTRATION_ASSUMPTIONS).toContain("before any costs");
      expect(ILLUSTRATION_ASSUMPTIONS.toLowerCase()).toContain("target");
    });
  });
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/investment-options.test.ts lib/copy/consumer.test.ts
  ```

  Expected: FAIL — `illustratorDownsideRows is not a function` and `ILLUSTRATION_ASSUMPTIONS` is `undefined`.

- [ ] **Step 3: Implement the helper and the copy constant**

  In `apps/web/lib/assets/investment-options.ts`, after `optionMonthlyIncome`:

  ```ts
  export type IllustratorDownsideRow = {
    id: "half_of_target" | "no_income";
    label: string;
    monthlyEur: number;
  };

  /**
   * Adverse-scenario rows for the income illustrator: income at 50% of
   * target, and at zero. Derived from the same annual figure as the
   * headline row so the scenarios stay consistent with it.
   */
  export function illustratorDownsideRows(annualIncomeEur: number): IllustratorDownsideRow[] {
    return [
      {
        id: "half_of_target",
        label: "If income is half of target",
        monthlyEur: optionMonthlyIncome(Math.round(annualIncomeEur / 2))
      },
      { id: "no_income", label: "If no income is paid", monthlyEur: 0 }
    ];
  }
  ```

  In `apps/web/lib/copy/consumer.ts`, after `ILLUSTRATION_DISCLAIMER`:

  ```ts
  export const ILLUSTRATION_ASSUMPTIONS =
    "Assumes target income is achieved. Figures are gross of tax and before any costs; the target basis is described in the deal documents.";
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/investment-options.test.ts lib/copy/consumer.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Render the rows and the note in the illustrator**

  In `apps/web/components/opportunity-detail-returns.tsx`:

  Extend the imports:

  ```ts
  import {
    illustratorDownsideRows,
    optionAnnualIncome,
    optionDerivedLabels,
    optionMonthlyIncome,
    type InvestmentOption
  } from "@/lib/assets/investment-options";
  import { ILLUSTRATION_ASSUMPTIONS, ILLUSTRATION_DISCLAIMER } from "@/lib/copy/consumer";
  ```

  Inside `.income-illustrator-results`, after the "Illustrative annual amount" `<div>`, add:

  ```tsx
  {illustratorDownsideRows(illusAnnual).map((row) => (
    <div key={row.id}>
      <label>{row.label}</label>
      <b>{formatEur(row.monthlyEur)} / month</b>
    </div>
  ))}
  ```

  Replace the assumptions paragraph:

  ```tsx
  <p id="illus-assumptions" className="field-hint">
    {ILLUSTRATION_DISCLAIMER}
  </p>
  ```

  with:

  ```tsx
  <p id="illus-assumptions" className="field-hint">
    {ILLUSTRATION_DISCLAIMER} {ILLUSTRATION_ASSUMPTIONS}
  </p>
  ```

- [ ] **Step 6: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

  Expected: clean tsc, all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/investment-options.ts apps/web/lib/assets/investment-options.test.ts apps/web/lib/copy/consumer.ts apps/web/lib/copy/consumer.test.ts apps/web/components/opportunity-detail-returns.tsx
  git commit -m "catalogue: add downside scenarios and assumptions note to income illustrator"
  ```

---

### Task 22: Mobile sticky CTA risk line; drop hidden-amount compact submit

Finding 4. Two markup changes:

1. The mobile sticky bar in `components/opportunity-detail-client.tsx:237-247` shows option + yield + minimum but no risk line. Add `RISK_LINE` (already used in `components/opportunity-detail-summary.tsx:80` with the `.risk-line` class, defined in `app/globals.css:451`).
2. `components/opportunity-detail-cta.tsx` has a `compact` mode that submits with a hidden `amountEur` input (line 142) so the investor never sees or confirms the amount. Remove `compact` entirely: the mobile bar renders the same full form (amount field + note + risk-acknowledgement checkbox) as the sidebar.

These are markup/routing changes with no new logic; the underlying `createInterest` submission path is already covered by `tests/integration/interests.integration.test.ts`. Exact edits + full verification below.

**Files:**
- Modify: `apps/web/components/opportunity-detail-client.tsx`
- Modify: `apps/web/components/opportunity-detail-cta.tsx`

**Interfaces:**
- Consumes: `RISK_LINE` from `lib/copy/consumer.ts` (existing export).
- Produces: `AllocationCta({ cta, assetSlug, selected }: { cta: DetailCtaDecision; assetSlug: string; selected: InvestmentOption | undefined })` — the `compact` prop is removed; both call sites are in this repo and updated here.

- [ ] **Step 1: Add RISK_LINE to the mobile sticky bar**

  In `apps/web/components/opportunity-detail-client.tsx`, add the import:

  ```ts
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  Replace the mobile bar block:

  ```tsx
  {selected && presentation.allowsInvestmentCta ? (
    <div className="mobile-allocation-bar">
      <div>
        <strong>{selected.id === "green" ? "EV option" : selected.label}</strong>
        <span className="field-hint">
          {formatYieldPct(selected.yieldPct)} target · From {formatEur(selected.minTicketEur)}
        </span>
      </div>
      <AllocationCta cta={cta} assetSlug={props.assetSlug} selected={selected} compact />
    </div>
  ) : null}
  ```

  with:

  ```tsx
  {selected && presentation.allowsInvestmentCta ? (
    <div className="mobile-allocation-bar">
      <div>
        <strong>{selected.id === "green" ? "EV option" : selected.label}</strong>
        <span className="field-hint">
          {formatYieldPct(selected.yieldPct)} target · From {formatEur(selected.minTicketEur)}
        </span>
        <span className="field-hint risk-line">{RISK_LINE}</span>
      </div>
      <AllocationCta cta={cta} assetSlug={props.assetSlug} selected={selected} />
    </div>
  ) : null}
  ```

- [ ] **Step 2: Remove the compact/hidden-amount path from the CTA**

  In `apps/web/components/opportunity-detail-cta.tsx`:

  Change `AllocationCta`'s signature — remove `compact`:

  ```tsx
  export function AllocationCta({
    cta,
    assetSlug,
    selected
  }: {
    cta: DetailCtaDecision;
    assetSlug: string;
    selected: InvestmentOption | undefined;
  }) {
  ```

  Change the `allowsInterestForm` branch:

  ```tsx
  if (cta.allowsInterestForm) {
    return <InterestFormWithOption assetSlug={assetSlug} option={selected} />;
  }
  ```

  Change `InterestFormWithOption` — drop the `compact` prop:

  ```tsx
  function InterestFormWithOption({
    assetSlug,
    option
  }: {
    assetSlug: string;
    option: InvestmentOption;
  }) {
  ```

  Replace the conditional amount/note block:

  ```tsx
  {!compact ? (
    <>
      <label className="form-field" htmlFor={amountId}>
        ...
      </label>
      <label className="form-field" htmlFor={noteId}>
        ...
      </label>
    </>
  ) : (
    <input type="hidden" name="amountEur" value={option.minTicketEur} />
  )}
  ```

  with the unconditional full form (identical fields to the old non-compact branch):

  ```tsx
  <label className="form-field" htmlFor={amountId}>
    <span>Investment amount (EUR)</span>
    <input
      key={option.id}
      id={amountId}
      name="amountEur"
      type="number"
      min={option.minTicketEur}
      step={1}
      required
      defaultValue={option.minTicketEur}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    />
  </label>
  <label className="form-field" htmlFor={noteId}>
    <span>Note (optional)</span>
    <textarea id={noteId} name="note" maxLength={500} rows={2} />
  </label>
  ```

- [ ] **Step 3: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  grep -rn "compact" components/opportunity-detail-cta.tsx components/opportunity-detail-client.tsx
  ```

  Expected: tsc clean (no other `compact` callers exist — tsc proves it), all tests pass, grep finds no `compact` in either file.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/components/opportunity-detail-client.tsx apps/web/components/opportunity-detail-cta.tsx
  git commit -m "catalogue: risk line on mobile sticky CTA, remove hidden-amount compact submit"
  ```

---

### Task 23: One yield basis for card display, sort, and filter

Finding 5 (basis alignment) + finding 6 (soften lead, `RISK_LINE_SHORT` on cards).

Current mismatch: cards/hero display the full band via `formatYieldBand` ("8.2% → 9.5%", `lib/assets/presentation.ts:118`) while sort and the yield filter use the *recommended* option's yield (`primaryYield` in `app/opportunities/opportunities-catalogue.tsx:19-24`).

Decision (one semantics, applied consistently): **the basis is the band max** — the highest option target yield.

- Display: `formatYieldCeiling(options)` → `Up to 9.5%` when options span a band, plain `8.2%` when they (nearly) coincide. This flows through `buildOpportunityPresentation`, so cards and the detail hero stay in parity automatically (`parityKey.yieldDisplay` unchanged in shape).
- Sort `yield_desc` and the yield-band filter use `yieldBand(options).max`.
- `formatYieldBand` stays exported — `app/opportunities/[slug]/opengraph-image.tsx:21` still uses it; the OG image is out of scope.

The sort/filter helpers move from the client component into a new pure module so they are testable (there is no component test harness).

**Files:**
- Modify: `apps/web/lib/assets/investment-options.ts`
- Create: `apps/web/lib/assets/catalogue-view.ts`
- Modify: `apps/web/lib/assets/presentation.ts`
- Modify: `apps/web/app/opportunities/opportunities-catalogue.tsx`
- Modify: `apps/web/components/asset-card.tsx`
- Modify: `apps/web/app/opportunities/page.tsx`
- Test: `apps/web/lib/assets/catalogue-view.test.ts` (new)
- Test: `apps/web/lib/assets/investment-options.test.ts`
- Test: `apps/web/lib/assets/presentation.test.ts`

**Interfaces:**
- Consumes: `yieldBand` (existing, `lib/assets/investment-options.ts:175`).
- Produces:
  - `formatYieldCeiling(options: InvestmentOption[]): string` (in `lib/assets/investment-options.ts`)
  - `lib/assets/catalogue-view.ts`:
    - `type CatalogueSortKey = "name_asc" | "min_asc" | "yield_desc"`
    - `catalogueYieldBasis(asset: CatalogueOptionSource): number`
    - `catalogueMinBasis(asset: CatalogueOptionSource): number`
    - `parseCatalogueSort(v: string | null): CatalogueSortKey`
    - `sortCatalogueAssets<T extends CatalogueOptionSource>(assets: T[], sort: CatalogueSortKey): T[]`
    - `matchesYieldBand(yieldBasis: number, band: string): boolean`
    - `matchesMinBand(minBasis: number, band: string): boolean`
  - Task 24 extends this module with `countFullyFunded`.

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/lib/assets/catalogue-view.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import {
    catalogueMinBasis,
    catalogueYieldBasis,
    matchesMinBand,
    matchesYieldBand,
    parseCatalogueSort,
    sortCatalogueAssets
  } from "@/lib/assets/catalogue-view";
  import { DEFAULT_COMMERCIAL_TERM_IDS } from "@/lib/assets/commercial-terms";
  import type { InvestmentOption } from "@/lib/assets/investment-options";

  const standard: InvestmentOption = {
    id: "standard",
    label: "Standard option",
    recommended: true,
    minTicketEur: 10000,
    yieldPct: 8,
    monthlyIncomeEur: 67,
    annualIncomeEur: 800,
    commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
  };
  const premium: InvestmentOption = {
    id: "premium",
    label: "Premium option",
    recommended: false,
    minTicketEur: 25000,
    yieldPct: 9.5,
    monthlyIncomeEur: 198,
    annualIncomeEur: 2375,
    commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
  };

  function asset(
    name: string,
    investmentOptions: InvestmentOption[],
    targetYieldPct: string | number,
    minTicketEur: string | number
  ) {
    return { name, investmentOptions, targetYieldPct, minTicketEur };
  }

  describe("catalogueYieldBasis", () => {
    it("uses the band max so display, sort, and filter share one basis", () => {
      expect(catalogueYieldBasis(asset("A", [standard, premium], 8, 10000))).toBe(9.5);
    });

    it("falls back to the asset-level target when there are no options", () => {
      expect(catalogueYieldBasis(asset("A", [], "7.4", 10000))).toBe(7.4);
    });
  });

  describe("catalogueMinBasis", () => {
    it("uses the recommended option minimum, matching the card display", () => {
      expect(catalogueMinBasis(asset("A", [standard, premium], 8, 10000))).toBe(10000);
    });

    it("falls back to the asset-level minimum when there are no options", () => {
      expect(catalogueMinBasis(asset("A", [], 8, "15000"))).toBe(15000);
    });
  });

  describe("parseCatalogueSort", () => {
    it("defaults to the neutral name A–Z sort", () => {
      expect(parseCatalogueSort(null)).toBe("name_asc");
      expect(parseCatalogueSort("bogus")).toBe("name_asc");
    });

    it("accepts the known sort keys", () => {
      expect(parseCatalogueSort("min_asc")).toBe("min_asc");
      expect(parseCatalogueSort("yield_desc")).toBe("yield_desc");
    });
  });

  describe("sortCatalogueAssets", () => {
    const low = asset("Beta", [standard], 8, 10000);
    const high = asset("Alpha", [standard, premium], 8, 10000);

    it("sorts yield_desc on the band max", () => {
      expect(sortCatalogueAssets([low, high], "yield_desc").map((a) => a.name)).toEqual([
        "Alpha",
        "Beta"
      ]);
    });

    it("does not mutate the input array", () => {
      const input = [low, high];
      sortCatalogueAssets(input, "yield_desc");
      expect(input.map((a) => a.name)).toEqual(["Beta", "Alpha"]);
    });
  });

  describe("matchesYieldBand", () => {
    it("matches the same basis the card displays", () => {
      expect(matchesYieldBand(9.5, "over9")).toBe(true);
      expect(matchesYieldBand(9.5, "8to9")).toBe(false);
      expect(matchesYieldBand(8.5, "8to9")).toBe(true);
      expect(matchesYieldBand(7.9, "under8")).toBe(true);
      expect(matchesYieldBand(9.5, "all")).toBe(true);
    });
  });

  describe("matchesMinBand", () => {
    it("keeps the existing band boundaries", () => {
      expect(matchesMinBand(9999, "under10")).toBe(true);
      expect(matchesMinBand(10000, "10to25")).toBe(true);
      expect(matchesMinBand(25000, "10to25")).toBe(true);
      expect(matchesMinBand(25001, "over25")).toBe(true);
      expect(matchesMinBand(10000, "all")).toBe(true);
    });
  });
  ```

  Append to `apps/web/lib/assets/investment-options.test.ts` (add `formatYieldCeiling` to the import):

  ```ts
  describe("formatYieldCeiling", () => {
    it("shows up-to band max when options span a band", () => {
      const low = {
        id: "standard" as const,
        label: "Standard",
        recommended: true,
        minTicketEur: 10000,
        yieldPct: 8.2,
        monthlyIncomeEur: 68,
        annualIncomeEur: 820,
        commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
      };
      const high = { ...low, id: "premium" as const, recommended: false, yieldPct: 9.5 };
      expect(formatYieldCeiling([low, high])).toBe("Up to 9.5%");
    });

    it("shows a plain figure when options coincide", () => {
      const only = {
        id: "standard" as const,
        label: "Standard",
        recommended: true,
        minTicketEur: 10000,
        yieldPct: 8.2,
        monthlyIncomeEur: 68,
        annualIncomeEur: 820,
        commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
      };
      expect(formatYieldCeiling([only])).toBe("8.2%");
    });
  });
  ```

  Append to `apps/web/lib/assets/presentation.test.ts` inside `describe("buildOpportunityPresentation", ...)`:

  ```ts
  it("displays the yield on the band-max basis with an up-to qualifier", () => {
    const premiumOption: InvestmentOption = {
      ...standardOption,
      id: "premium",
      label: "Premium",
      recommended: false,
      minTicketEur: 25000,
      yieldPct: 9.5,
      monthlyIncomeEur: 198,
      annualIncomeEur: 2375
    };
    const p = buildOpportunityPresentation(
      baseInput({ investmentOptions: [standardOption, premiumOption] })
    );
    expect(p.yieldDisplay).toBe("Up to 9.5%");
  });
  ```

  (The existing test expecting `"8.2%"` for the single-option input keeps passing — a single option is not a band.)

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/catalogue-view.test.ts lib/assets/investment-options.test.ts lib/assets/presentation.test.ts
  ```

  Expected: FAIL — `catalogue-view` module not found, `formatYieldCeiling is not a function`, and the new presentation test gets `"8.2% → 9.5%"` instead of `"Up to 9.5%"`.

- [ ] **Step 3: Implement `formatYieldCeiling`**

  In `apps/web/lib/assets/investment-options.ts`, after `formatYieldBand`:

  ```ts
  /**
   * Card/hero yield display on the band-max basis: "Up to 9.5%" when options
   * span a band, plain "8.2%" when they (nearly) coincide. Matches the
   * catalogue sort/filter basis in `lib/assets/catalogue-view.ts`.
   */
  export function formatYieldCeiling(options: InvestmentOption[]): string {
    const { min, max } = yieldBand(options);
    if (max - min < 0.5) {
      return `${max.toFixed(1)}%`;
    }
    return `Up to ${max.toFixed(1)}%`;
  }
  ```

- [ ] **Step 4: Create `lib/assets/catalogue-view.ts`**

  ```ts
  /**
   * Pure catalogue view logic. Card display, sort, and filter all share one
   * basis so the figure on the card is the figure sort/filter use:
   * yield = band max ("Up to X%"), minimum = recommended option's minimum.
   */

  import { yieldBand, type InvestmentOption } from "@/lib/assets/investment-options";

  export type CatalogueSortKey = "name_asc" | "min_asc" | "yield_desc";

  /** Narrow structural type so tests don't need full list-field fixtures. */
  export type CatalogueOptionSource = {
    name: string;
    investmentOptions?: InvestmentOption[];
    targetYieldPct: string | number;
    minTicketEur: string | number;
  };

  /** Highest option target yield; falls back to the asset-level target. */
  export function catalogueYieldBasis(asset: CatalogueOptionSource): number {
    const opts = asset.investmentOptions ?? [];
    if (opts.length > 0) return yieldBand(opts).max;
    return Number(asset.targetYieldPct);
  }

  /** Recommended option's minimum (same fallback chain as the card display). */
  export function catalogueMinBasis(asset: CatalogueOptionSource): number {
    const opts = asset.investmentOptions ?? [];
    const rec = opts.find((o) => o.recommended) ?? opts.find((o) => o.id === "standard") ?? opts[0];
    if (rec) return rec.minTicketEur;
    return Number(asset.minTicketEur);
  }

  /** Neutral default is name A–Z; unknown or missing values fall back to it. */
  export function parseCatalogueSort(v: string | null): CatalogueSortKey {
    if (v === "min_asc" || v === "yield_desc" || v === "name_asc") return v;
    return "name_asc";
  }

  export function sortCatalogueAssets<T extends CatalogueOptionSource>(
    assets: T[],
    sort: CatalogueSortKey
  ): T[] {
    const list = [...assets];
    list.sort((a, b) => {
      if (sort === "min_asc") return catalogueMinBasis(a) - catalogueMinBasis(b);
      if (sort === "yield_desc") return catalogueYieldBasis(b) - catalogueYieldBasis(a);
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  export function matchesYieldBand(yieldBasis: number, band: string): boolean {
    if (band === "under8") return yieldBasis < 8;
    if (band === "8to9") return yieldBasis >= 8 && yieldBasis <= 9;
    if (band === "over9") return yieldBasis > 9;
    return true;
  }

  export function matchesMinBand(minBasis: number, band: string): boolean {
    if (band === "under10") return minBasis < 10000;
    if (band === "10to25") return minBasis >= 10000 && minBasis <= 25000;
    if (band === "over25") return minBasis > 25000;
    return true;
  }
  ```

- [ ] **Step 5: Switch the presentation to the ceiling display**

  In `apps/web/lib/assets/presentation.ts`, change the import:

  ```ts
  import {
    formatYieldCeiling,
    type InvestmentOption
  } from "@/lib/assets/investment-options";
  ```

  and in `resolveYieldDisplay` replace `return formatYieldBand(options);` with `return formatYieldCeiling(options);`.

- [ ] **Step 6: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/catalogue-view.test.ts lib/assets/investment-options.test.ts lib/assets/presentation.test.ts
  ```

  Expected: PASS.

- [ ] **Step 7: Rewire the catalogue component to the shared helpers**

  In `apps/web/app/opportunities/opportunities-catalogue.tsx`:

  Delete the local `type SortKey`, `primaryYield`, `primaryMin`, and `parseSort` declarations (lines 17-36). Change the imports:

  ```ts
  import {
    catalogueMinBasis,
    catalogueYieldBasis,
    matchesMinBand,
    matchesYieldBand,
    parseCatalogueSort,
    sortCatalogueAssets
  } from "@/lib/assets/catalogue-view";
  ```

  Change the sort derivation:

  ```ts
  const sort = parseCatalogueSort(searchParams.get("sort"));
  ```

  Replace the min/yield filter and sort logic inside the `filtered` memo:

  ```ts
  const min = primaryMin(a);
  if (minBand === "under10" && min >= 10000) return false;
  if (minBand === "10to25" && (min < 10000 || min > 25000)) return false;
  if (minBand === "over25" && min <= 25000) return false;

  const y = primaryYield(a);
  if (yieldBand === "under8" && y >= 8) return false;
  if (yieldBand === "8to9" && (y < 8 || y > 9)) return false;
  if (yieldBand === "over9" && y <= 9) return false;

  return true;
  });

  list.sort((a, b) => {
    if (sort === "min_asc") return primaryMin(a) - primaryMin(b);
    if (sort === "yield_desc") return primaryYield(b) - primaryYield(a);
    return a.name.localeCompare(b.name);
  });
  return list;
  ```

  with:

  ```ts
  if (!matchesMinBand(catalogueMinBasis(a), minBand)) return false;
  if (!matchesYieldBand(catalogueYieldBasis(a), yieldBand)) return false;

  return true;
  });

  return sortCatalogueAssets(list, sort);
  ```

  (The `<select>` options and `SortKey` usages in the JSX are unchanged — `sort` is still one of the three string keys.)

- [ ] **Step 8: Add RISK_LINE_SHORT to cards and soften the catalogue lead**

  In `apps/web/components/asset-card.tsx`, change the copy import:

  ```ts
  import { RISK_LINE_SHORT, TARGET_RETURN_EXPLAINER } from "@/lib/copy/consumer";
  ```

  Replace the disclaimer block:

  ```tsx
  {!homepage ? (
    <p className="field-hint asset-card-disclaimer">{TARGET_RETURN_EXPLAINER}</p>
  ) : null}
  ```

  with:

  ```tsx
  {!homepage ? (
    <>
      <p className="field-hint asset-card-disclaimer">{TARGET_RETURN_EXPLAINER}</p>
      <p className="field-hint asset-card-disclaimer risk-line">{RISK_LINE_SHORT}</p>
    </>
  ) : null}
  ```

  In `apps/web/app/opportunities/page.tsx`, replace the `PageIntro` lead:

  ```tsx
  lead="Every listing shows its target return, minimum ticket, term, and risks up front. Figures are targets or illustrations — never guarantees."
  ```

  with:

  ```tsx
  lead="Compare target returns, minimums, and terms side by side — each listing also sets out its key risks. Figures are targets or illustrations, never guarantees."
  ```

- [ ] **Step 9: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  Expected: all clean. (The build catches the server/client boundary — `catalogue-view.ts` is imported only from the client catalogue component and pure lib tests, so it needs no `"use client"`.)

- [ ] **Step 10: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/investment-options.ts apps/web/lib/assets/investment-options.test.ts apps/web/lib/assets/catalogue-view.ts apps/web/lib/assets/catalogue-view.test.ts apps/web/lib/assets/presentation.ts apps/web/lib/assets/presentation.test.ts apps/web/app/opportunities/opportunities-catalogue.tsx apps/web/components/asset-card.tsx apps/web/app/opportunities/page.tsx
  git commit -m "catalogue: one yield basis (band max, up-to display) for cards, sort, and filter; risk line on cards; softer lead"
  ```

---

### Task 24: Neutral default sort lock, yield-filter qualifier, boilerplate cut, fully-funded social proof

Findings 7, 8, 9.

- Finding 7: the default sort is already neutral — `parseCatalogueSort` (Task 23) falls back to `"name_asc"` and the test from Task 23 locks it. This task adds the remaining affordance: a brief qualifier next to the yield filter.
- Finding 8: cut the generic demand paragraph in `components/opportunity-detail-location.tsx:57-62` — the provenance-labelled stats carry the section.
- Finding 9: "N opportunities fully funded" line next to the catalogue result count. Funded assets remain filterable — the existing funding filter (`open` / `full` / `all`) is untouched.

**Files:**
- Modify: `apps/web/lib/assets/catalogue-view.ts`
- Modify: `apps/web/app/opportunities/opportunities-catalogue.tsx`
- Modify: `apps/web/components/opportunity-detail-location.tsx`
- Test: `apps/web/lib/assets/catalogue-view.test.ts`

**Interfaces:**
- Consumes: `lib/assets/catalogue-view.ts` from Task 23 (extends it); `parseCatalogueSort` neutral default already tested there.
- Produces: `countFullyFunded(assets: OpportunityListFields[]): number` in `lib/assets/catalogue-view.ts`.

- [ ] **Step 1: Write the failing test**

  Append to `apps/web/lib/assets/catalogue-view.test.ts` — first extend the import block at the top of the file to:

  ```ts
  import {
    catalogueMinBasis,
    catalogueYieldBasis,
    countFullyFunded,
    matchesMinBand,
    matchesYieldBand,
    parseCatalogueSort,
    sortCatalogueAssets
  } from "@/lib/assets/catalogue-view";
  import { DEFAULT_COMMERCIAL_TERM_IDS } from "@/lib/assets/commercial-terms";
  import { fundingFromAmounts } from "@/lib/assets/funding";
  import type { InvestmentOption } from "@/lib/assets/investment-options";
  import type { OpportunityListFields } from "@/lib/assets/list-fields";
  ```

  then append at the end of the file:

  ```ts
  function listAsset(overrides: Partial<OpportunityListFields>): OpportunityListFields {
    return {
      id: "00000000-0000-0000-0000-000000000001",
      slug: "hub-a",
      name: "Hub A",
      tier: "standard",
      city: "Dublin",
      country: "Ireland",
      operator: "Ops Co",
      spaces: 100,
      targetYieldPct: 8,
      minTicketEur: 10000,
      incomeMix: [{ id: "vehicle_parking", pct: 100 }],
      investmentOptions: [standard],
      assetStatus: "published",
      ...overrides
    };
  }

  describe("countFullyFunded", () => {
    it("counts only fully funded published assets", () => {
      const assets = [
        listAsset({ id: "00000000-0000-0000-0000-000000000001", funding: fundingFromAmounts(500000, 1000000) }),
        listAsset({ id: "00000000-0000-0000-0000-000000000002", slug: "hub-b", funding: fundingFromAmounts(1000000, 1000000) }),
        listAsset({ id: "00000000-0000-0000-0000-000000000003", slug: "hub-c", funding: fundingFromAmounts(1000000, 1000000) })
      ];
      expect(countFullyFunded(assets)).toBe(2);
    });

    it("returns zero when nothing is fully funded", () => {
      expect(
        countFullyFunded([
          listAsset({ funding: fundingFromAmounts(0, 1000000) })
        ])
      ).toBe(0);
    });
  });
  ```

  (`fundingFromAmounts(1000000, 1000000)` yields `open: false` → status `fully_funded`; `fundingFromAmounts(500000, 1000000)` is open.)

- [ ] **Step 2: Run to confirm failure**

  ```bash
  npx vitest run lib/assets/catalogue-view.test.ts
  ```

  Expected: FAIL — `countFullyFunded is not a function`.

- [ ] **Step 3: Implement `countFullyFunded`**

  In `apps/web/lib/assets/catalogue-view.ts`, add imports:

  ```ts
  import { listFieldsToPresentationInput, type OpportunityListFields } from "@/lib/assets/list-fields";
  import { buildOpportunityPresentation } from "@/lib/assets/presentation";
  ```

  and append:

  ```ts
  /** Published assets whose resolved status is fully funded (social-proof line). */
  export function countFullyFunded(assets: OpportunityListFields[]): number {
    return assets.filter(
      (a) =>
        buildOpportunityPresentation(listFieldsToPresentationInput(a)).status.id ===
        "fully_funded"
    ).length;
  }
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  npx vitest run lib/assets/catalogue-view.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Social-proof line + yield-filter qualifier in the catalogue component**

  In `apps/web/app/opportunities/opportunities-catalogue.tsx`, add `countFullyFunded` to the `@/lib/assets/catalogue-view` import, and inside the component (near the other memos):

  ```ts
  const fullyFundedCount = useMemo(() => countFullyFunded(assets), [assets]);
  ```

  Replace the result-count span:

  ```tsx
  <span className="filter-count" aria-live="polite">
    {filtered.length} {filtered.length === 1 ? "opportunity" : "opportunities"}
    {totalPages > 1 ? ` · Page ${safePage} of ${totalPages}` : ""}
  </span>
  ```

  with:

  ```tsx
  <span className="filter-count" aria-live="polite">
    {filtered.length} {filtered.length === 1 ? "opportunity" : "opportunities"}
    {totalPages > 1 ? ` · Page ${safePage} of ${totalPages}` : ""}
  </span>
  {fullyFundedCount > 0 ? (
    <span className="field-hint filter-funded-note">
      {fullyFundedCount === 1
        ? "1 opportunity fully funded"
        : `${fullyFundedCount} opportunities fully funded`}
    </span>
  ) : null}
  ```

  Inside the "Target return" `.filter-field`, after the `</select>`, add the qualifier:

  ```tsx
  <p className="field-hint">
    Bands match each listing&apos;s highest option target. Targets are not guaranteed.
  </p>
  ```

- [ ] **Step 6: Cut the demand boilerplate in the location section**

  In `apps/web/components/opportunity-detail-location.tsx`, replace:

  ```tsx
  <p>
    Located in {city}, {country}
    {siteType ? ` (${siteType})` : ""}. Demand here comes from commuters,
    residents, visitors, and nearby venues. Results still depend on
    local competition, pricing, and occupancy.
  </p>
  ```

  with:

  ```tsx
  <p>
    Located in {city}, {country}
    {siteType ? ` (${siteType})` : ""}.
  </p>
  ```

  (Keep the provenance stats block and the trailing "Local demand indicators do not guarantee investment performance." hint — they carry the section now.)

- [ ] **Step 7: Verify**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  Expected: all clean.

- [ ] **Step 8: Commit**

  ```bash
  cd /Users/mac/Documents/Park
  git add apps/web/lib/assets/catalogue-view.ts apps/web/lib/assets/catalogue-view.test.ts apps/web/app/opportunities/opportunities-catalogue.tsx apps/web/components/opportunity-detail-location.tsx
  git commit -m "catalogue: yield-filter qualifier, fully-funded count line, cut location demand boilerplate"
  ```

---

## Finding coverage map

| Spec finding (Area 2) | Task |
| --- | --- |
| 1. "Recommended" badge → derived labels; flag internal-only | 19 |
| 2. Term-sheet "Key terms" summary | 20 |
| 3. Illustrator downside rows + assumptions note | 21 |
| 4. Mobile sticky CTA risk line; remove hidden-amount compact submit | 22 |
| 5. Yield band vs sort/filter — one basis | 23 |
| 6. Soften "risks up front" lead; `RISK_LINE_SHORT` on cards | 23 |
| 7. Neutral default sort; yield-filter qualifier | 24 |
| 8. Cut demand boilerplate | 24 |
| 9. "N fully funded" social proof near count | 24 |

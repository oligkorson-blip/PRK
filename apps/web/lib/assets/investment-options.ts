import {
  isCommercialTermId,
  type CommercialTermId,
  validateCommercialTermIds
} from "@/lib/assets/commercial-terms";
import {
  hasEv,
  type IncomeMixEntry
} from "@/lib/assets/income-streams";
import { BUYBACK_ENABLED } from "@/lib/copy/posture";

export const INVESTMENT_OPTION_IDS = ["standard", "premium", "green"] as const;
export type InvestmentOptionId = (typeof INVESTMENT_OPTION_IDS)[number];

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

export function supportsGreenOption(mix: IncomeMixEntry[], supportsGreen?: boolean): boolean {
  if (supportsGreen) return true;
  return hasEv(mix) || mix.some((e) => e.id === "micromobility_charging");
}

export function optionAnnualIncome(minTicketEur: number, yieldPct: number): number {
  return Math.round((minTicketEur * yieldPct) / 100);
}

export function optionMonthlyIncome(annualIncomeEur: number): number {
  return Math.round(annualIncomeEur / 12);
}

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

export function validateInvestmentOption(
  option: unknown,
  context: { mix: IncomeMixEntry[]; supportsGreen?: boolean }
): { ok: true; option: InvestmentOption } | { ok: false; error: string } {
  if (typeof option !== "object" || option === null) {
    return { ok: false, error: "option must be an object" };
  }

  const o = option as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== "string" || !(INVESTMENT_OPTION_IDS as readonly string[]).includes(id)) {
    return { ok: false, error: "invalid option id" };
  }

  if (id === "green" && !supportsGreenOption(context.mix, context.supportsGreen)) {
    return { ok: false, error: "green option requires EV or micromobility charging story" };
  }

  if (typeof o.label !== "string" || o.label.trim().length === 0) {
    return { ok: false, error: "option label required" };
  }
  if (typeof o.recommended !== "boolean") {
    return { ok: false, error: "recommended must be boolean" };
  }
  if (typeof o.minTicketEur !== "number" || !Number.isInteger(o.minTicketEur) || o.minTicketEur < 1000) {
    return { ok: false, error: "minTicketEur must be an integer ≥ 1000" };
  }
  if (typeof o.yieldPct !== "number" || !Number.isFinite(o.yieldPct) || o.yieldPct <= 0) {
    return { ok: false, error: "yieldPct must be a positive number" };
  }

  const expectedAnnual = optionAnnualIncome(o.minTicketEur, o.yieldPct);
  if (typeof o.annualIncomeEur !== "number" || o.annualIncomeEur !== expectedAnnual) {
    return {
      ok: false,
      error: `annualIncomeEur must equal round(minTicket × yield/100) (= ${expectedAnnual})`
    };
  }

  const expectedMonthly = optionMonthlyIncome(expectedAnnual);
  if (
    typeof o.monthlyIncomeEur !== "number" ||
    Math.abs(o.monthlyIncomeEur - expectedMonthly) > 1
  ) {
    return {
      ok: false,
      error: `monthlyIncomeEur must equal round(annual/12) (= ${expectedMonthly} ±1)`
    };
  }

  const terms = validateCommercialTermIds(o.commercialTermIds);
  if (!terms.ok) return terms;

  if (terms.ids.includes("buyback_at_par")) {
    if (!BUYBACK_ENABLED) {
      return {
        ok: false,
        error: "buyback_at_par forbidden until BUYBACK_FUNDED=true (CRO R3)"
      };
    }
    if (id === "standard") {
      return { ok: false, error: "buyback_at_par not allowed on standard option" };
    }
  }

  for (const tid of terms.ids) {
    if (!isCommercialTermId(tid)) {
      return { ok: false, error: "invalid term id" };
    }
  }

  return {
    ok: true,
    option: {
      id: id as InvestmentOptionId,
      label: o.label.trim(),
      recommended: o.recommended,
      minTicketEur: o.minTicketEur,
      yieldPct: o.yieldPct,
      monthlyIncomeEur: o.monthlyIncomeEur as number,
      annualIncomeEur: o.annualIncomeEur as number,
      commercialTermIds: terms.ids
    }
  };
}

export function validateInvestmentOptions(
  options: unknown,
  context: { mix: IncomeMixEntry[]; supportsGreen?: boolean }
): { ok: true; options: InvestmentOption[] } | { ok: false; error: string } {
  if (!Array.isArray(options) || options.length === 0) {
    return { ok: false, error: "investmentOptions must be a non-empty array" };
  }

  const parsed: InvestmentOption[] = [];
  const seen = new Set<string>();
  let recommendedCount = 0;

  for (const item of options) {
    const result = validateInvestmentOption(item, context);
    if (!result.ok) return result;
    if (seen.has(result.option.id)) {
      return { ok: false, error: "duplicate option id" };
    }
    seen.add(result.option.id);
    if (result.option.recommended) recommendedCount += 1;
    parsed.push(result.option);
  }

  if (!seen.has("standard")) {
    return { ok: false, error: "standard option is required" };
  }
  if (recommendedCount !== 1) {
    return { ok: false, error: "exactly one option must be recommended" };
  }

  const byId = Object.fromEntries(parsed.map((o) => [o.id, o])) as Partial<
    Record<InvestmentOptionId, InvestmentOption>
  >;
  const standard = byId.standard!;
  const premium = byId.premium;
  const green = byId.green;

  if (premium && premium.yieldPct < standard.yieldPct) {
    return { ok: false, error: "premium yield must be ≥ standard" };
  }
  if (green && premium && green.yieldPct < premium.yieldPct) {
    return { ok: false, error: "green yield must be ≥ premium" };
  }
  if (green && !premium && green.yieldPct < standard.yieldPct) {
    return { ok: false, error: "green yield must be ≥ standard" };
  }

  return { ok: true, options: parsed };
}

export function yieldBand(options: InvestmentOption[]): { min: number; max: number } {
  const yields = options.map((o) => o.yieldPct);
  return { min: Math.min(...yields), max: Math.max(...yields) };
}

export function formatYieldBand(options: InvestmentOption[]): string {
  const { min, max } = yieldBand(options);
  if (max - min < 0.5) {
    return `${min.toFixed(1)}%`;
  }
  return `${min.toFixed(1)}% → ${max.toFixed(1)}%`;
}

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

export function findOption(
  options: InvestmentOption[],
  id: string | null | undefined
): InvestmentOption | undefined {
  if (!id) return options.find((o) => o.recommended) ?? options.find((o) => o.id === "standard");
  return options.find((o) => o.id === id);
}

export function buildStandardOption(input: {
  minTicketEur: number;
  yieldPct: number;
  commercialTermIds: CommercialTermId[];
  recommended?: boolean;
}): InvestmentOption {
  const annualIncomeEur = optionAnnualIncome(input.minTicketEur, input.yieldPct);
  return {
    id: "standard",
    label: "Standard option",
    recommended: input.recommended ?? true,
    minTicketEur: input.minTicketEur,
    yieldPct: input.yieldPct,
    monthlyIncomeEur: optionMonthlyIncome(annualIncomeEur),
    annualIncomeEur,
    commercialTermIds: input.commercialTermIds
  };
}

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
import { isMetricProvenance, type MetricProvenance } from "@/lib/assets/metric-provenance";
import type { Asset } from "@/lib/assets";

/** Site types used across the seed catalogue (free text in the DB). */
export const SITE_TYPE_OPTIONS = ["airport", "city", "retail", "station"] as const;

export type AssetFormInput = {
  name: string;
  city: string;
  country: string;
  /** "" or one of SITE_TYPE_OPTIONS */
  siteType: string;
  /** Publish-required operating profile. */
  spaces: string;
  occupancyPct: string;
  operator: string;
  /** Free-text lease term, e.g. "12 years" (assets.leaseLabel). */
  term: string;
  /** "monthly" maps to the contractual_monthly_rent commercial term. */
  paymentFrequency: string;
  /** Raw text; "" clears (parseAdvisoryCapacityInput). */
  advisoryCapacityEur: string;
  /** Longer marketing description (assets.blurb). */
  description: string;
  /** "" allowed; https URL or site path. */
  coverImageUrl: string;
  placeStory: string;
  operatorStory: string;
  demandStory: string;
  numbersNote: string;
  visitorsProvenance: string;
  revenueProvenance: string;
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
  placeStory: string | null;
  operatorStory: string | null;
  demandStory: string | null;
  numbersNote: string | null;
  siteType: string | null;
  incomeMix: IncomeMixEntry[];
  commercialTermIds: CommercialTermId[];
  investmentOptions: InvestmentOption[];
  advisoryCapacityEur: number | null;
  coverImageUrl: string | null;
  visitorsProvenance: MetricProvenance;
  revenueProvenance: MetricProvenance;
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
    return u.protocol === "https:";
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
    spaces: "",
    occupancyPct: "",
    operator: "",
    term: "",
    paymentFrequency: "monthly",
    advisoryCapacityEur: "",
    description: "",
    coverImageUrl: "",
    placeStory: "",
    operatorStory: "",
    demandStory: "",
    numbersNote: "",
    visitorsProvenance: "withheld",
    revenueProvenance: "withheld",
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

function optionalText(raw: string): string | null {
  const t = raw.trim();
  return t ? t : null;
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

  const spaces = parsePositiveInt(input.spaces, "Parking spaces");
  if (!spaces.ok) return spaces;
  const occupancy = parseYieldPct(input.occupancyPct, "Occupancy");
  if (!occupancy.ok) return occupancy;

  const leaseLabel = input.term.trim();
  if (!leaseLabel) return { ok: false, error: 'Term is required (e.g. "12 years").' };

  if (input.paymentFrequency !== "monthly" && input.paymentFrequency !== "other") {
    return { ok: false, error: "Unknown payment frequency." };
  }

  const blurb = input.description.trim();
  if (!blurb) return { ok: false, error: "Description is required." };

  if (!isMetricProvenance(input.visitorsProvenance)) {
    return { ok: false, error: "Unknown visitors provenance." };
  }
  if (!isMetricProvenance(input.revenueProvenance)) {
    return { ok: false, error: "Unknown revenue provenance." };
  }

  const cover = input.coverImageUrl.trim();
  if (cover && !isSafeHttpUrl(cover)) {
    return {
      ok: false,
      error: "Cover image must be an https URL or a site path starting with /."
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
      spaces: spaces.value,
      occupancyPct: occupancy.value.toFixed(2),
      leaseLabel,
      blurb,
      placeStory: optionalText(input.placeStory),
      operatorStory: optionalText(input.operatorStory),
      demandStory: optionalText(input.demandStory),
      numbersNote: optionalText(input.numbersNote),
      siteType: siteType || null,
      incomeMix: mix,
      commercialTermIds: terms.ids,
      investmentOptions: validatedOptions.options,
      advisoryCapacityEur: capacity.value,
      coverImageUrl: cover || null,
      visitorsProvenance: input.visitorsProvenance,
      revenueProvenance: input.revenueProvenance
    }
  };
}

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
    spaces: String(asset.spaces),
    occupancyPct: String(Number(asset.occupancyPct)),
    operator: asset.operator,
    term: asset.leaseLabel,
    paymentFrequency: asset.commercialTermIds.includes("contractual_monthly_rent")
      ? "monthly"
      : "other",
    advisoryCapacityEur:
      asset.advisoryCapacityEur != null ? String(asset.advisoryCapacityEur) : "",
    description: asset.blurb,
    coverImageUrl: asset.coverImageUrl ?? "",
    placeStory: asset.placeStory ?? "",
    operatorStory: asset.operatorStory ?? "",
    demandStory: asset.demandStory ?? "",
    numbersNote: asset.numbersNote ?? "",
    visitorsProvenance: asset.visitorsProvenance ?? "withheld",
    revenueProvenance: asset.revenueProvenance ?? "withheld",
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

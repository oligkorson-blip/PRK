/**
 * Canonical consumer presentation contract for opportunity listing + detail.
 * All financial / contractual display values flow through here.
 */

import type { CommercialTermId } from "@/lib/assets/commercial-terms";
import type { FundingSnapshot } from "@/lib/assets/funding";
import {
  formatYieldCeiling,
  type InvestmentOption
} from "@/lib/assets/investment-options";
import {
  resolveOpportunityStatus,
  type AssetStatusValue,
  type OpportunityStatus
} from "@/lib/assets/opportunity-status";
import {
  publicOperatorLabel,
  type OperatorDisplay
} from "@/lib/assets/operator-display";
import { formatEur, formatYieldPct } from "@/lib/format";

export const MISSING_TERM = "See deal documents";
export const MISSING_PAYMENT_FREQUENCY = "See opportunity details";
export const NEUTRAL_OPERATOR = "Parking operator";

/** Canonical lowercase key for a site type (" Station " -> "station"). */
export function normalizeSiteType(siteType?: string | null): string | null {
  const cleaned = siteType?.trim().toLowerCase();
  return cleaned ? cleaned : null;
}

/** Title-cased site type for display ("station" -> "Station"). */
export function siteTypeDisplay(siteType?: string | null): string | null {
  const key = normalizeSiteType(siteType);
  if (!key) return null;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export type OpportunityDataIssue =
  | "missing_return"
  | "missing_minimum"
  | "missing_term"
  | "missing_payment_frequency"
  | "unavailable_status";

export type OpportunityPresentationInput = {
  name: string;
  slug: string;
  city: string;
  country: string;
  siteType?: string | null;
  operator: string;
  operatorDisplay?: OperatorDisplay | null;
  spaces: number;
  leaseLabel?: string | null;
  assetStatus: AssetStatusValue;
  targetYieldPct?: string | number | null;
  minTicketEur?: string | number | null;
  investmentOptions?: InvestmentOption[] | null;
  commercialTermIds?: CommercialTermId[] | null;
  funding?: FundingSnapshot | null;
};

export type OpportunityPresentation = {
  name: string;
  slug: string;
  locationLabel: string;
  siteType: string | null;
  operatorLabel: string;
  spaces: number;
  status: OpportunityStatus;
  yieldDisplay: string | null;
  minTicketDisplay: string | null;
  minTicketEur: number | null;
  paymentFrequencyDisplay: string;
  termDisplay: string;
  funding: FundingSnapshot | null;
  showFunding: boolean;
  allowsInvestmentCta: boolean;
  dataIssues: OpportunityDataIssue[];
  /** Shared fields for card ↔ detail parity checks */
  parityKey: {
    termDisplay: string;
    yieldDisplay: string | null;
    minTicketDisplay: string | null;
    paymentFrequencyDisplay: string;
    statusId: string;
  };
};

export function formatTargetTerm(leaseLabel: string | null | undefined): string {
  const trimmed = typeof leaseLabel === "string" ? leaseLabel.trim() : "";
  return trimmed.length > 0 ? trimmed : MISSING_TERM;
}

export function formatPaymentFrequency(
  commercialTermIds: readonly string[] | null | undefined
): string {
  if (commercialTermIds?.includes("contractual_monthly_rent")) {
    return "Monthly";
  }
  return MISSING_PAYMENT_FREQUENCY;
}

function parsePositiveNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveYieldDisplay(
  options: InvestmentOption[],
  targetYieldPct: string | number | null | undefined
): string | null {
  if (options.length > 0) {
    return formatYieldCeiling(options);
  }
  const n = parsePositiveNumber(targetYieldPct);
  if (n == null) return null;
  return formatYieldPct(n);
}

function resolveMinTicket(
  options: InvestmentOption[],
  minTicketEur: string | number | null | undefined
): number | null {
  if (options.length > 0) {
    const from =
      options.find((o) => o.recommended)?.minTicketEur ??
      options.find((o) => o.id === "standard")?.minTicketEur ??
      options[0]?.minTicketEur;
    if (typeof from === "number" && from > 0) return from;
  }
  return parsePositiveNumber(minTicketEur);
}

export function buildOpportunityPresentation(
  input: OpportunityPresentationInput
): OpportunityPresentation {
  const options = input.investmentOptions ?? [];
  const termIds = input.commercialTermIds ?? [];
  const dataIssues: OpportunityDataIssue[] = [];

  const termDisplay = formatTargetTerm(input.leaseLabel);
  if (termDisplay === MISSING_TERM) dataIssues.push("missing_term");

  const paymentFrequencyDisplay = formatPaymentFrequency(termIds);
  if (paymentFrequencyDisplay === MISSING_PAYMENT_FREQUENCY) {
    dataIssues.push("missing_payment_frequency");
  }

  const yieldDisplay = resolveYieldDisplay(options, input.targetYieldPct);
  if (yieldDisplay == null) dataIssues.push("missing_return");

  const minTicketEur = resolveMinTicket(options, input.minTicketEur);
  const minTicketDisplay = minTicketEur != null ? formatEur(minTicketEur) : null;
  if (minTicketEur == null) dataIssues.push("missing_minimum");

  const status = resolveOpportunityStatus({
    assetStatus: input.assetStatus,
    funding: input.funding
  });
  if (status.id === "unavailable") dataIssues.push("unavailable_status");

  const operatorRaw = publicOperatorLabel(input.operatorDisplay, input.operator);
  const operatorLabel =
    operatorRaw && operatorRaw.trim().length > 0 ? operatorRaw.trim() : NEUTRAL_OPERATOR;

  const showFunding = status.showFunding && Boolean(input.funding);
  const allowsInvestmentCta =
    status.permitsInterest && minTicketEur != null && yieldDisplay != null;

  return {
    name: input.name,
    slug: input.slug,
    locationLabel: `${input.city}, ${input.country}`,
    siteType: siteTypeDisplay(input.siteType),
    operatorLabel,
    spaces: input.spaces,
    status,
    yieldDisplay,
    minTicketDisplay,
    minTicketEur,
    paymentFrequencyDisplay,
    termDisplay,
    funding: input.funding ?? null,
    showFunding,
    allowsInvestmentCta,
    dataIssues,
    parityKey: {
      termDisplay,
      yieldDisplay,
      minTicketDisplay,
      paymentFrequencyDisplay,
      statusId: status.id
    }
  };
}

export function cardDetailParity(
  card: OpportunityPresentation,
  detail: OpportunityPresentation
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const keys = Object.keys(card.parityKey) as (keyof OpportunityPresentation["parityKey"])[];
  for (const key of keys) {
    if (card.parityKey[key] !== detail.parityKey[key]) {
      mismatches.push(key);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

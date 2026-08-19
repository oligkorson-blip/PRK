import type { CommercialTermId } from "@/lib/assets/commercial-terms";
import type { FundingSnapshot } from "@/lib/assets/funding";
import type { IncomeMixEntry } from "@/lib/assets/income-streams";
import type { InvestmentOption } from "@/lib/assets/investment-options";
import type { MetricProvenance } from "@/lib/assets/metric-provenance";
import type { OperatorDisplay } from "@/lib/assets/operator-display";
import type { OpportunityPresentationInput } from "@/lib/assets/presentation";

/** Shared fields needed to build card + detail presentation from a published asset row. */
export type OpportunityListFields = {
  id: string;
  slug: string;
  name: string;
  tier: string;
  city: string;
  country: string;
  operator: string;
  operatorDisplay?: OperatorDisplay | null;
  spaces: number;
  targetYieldPct: string | number;
  minTicketEur: string | number;
  incomeMix: IncomeMixEntry[];
  investmentOptions?: InvestmentOption[];
  commercialTermIds?: CommercialTermId[];
  leaseLabel?: string | null;
  assetStatus?: string;
  siteType?: string | null;
  artVariant?: number | null;
  coverImageUrl?: string | null;
  /** Short marketing description for catalogue hooks. */
  blurb?: string | null;
  reason?: string | null;
  funding?: FundingSnapshot | null;
  /** Optional operating figures for quick-view stat tiles (same data as the detail page). */
  visitorsPerDay?: number | null;
  visitorsProvenance?: MetricProvenance;
  availableSpaces?: number | null;
  annualRevenueEur?: number | null;
  revenueProvenance?: MetricProvenance;
  occupancyPct?: string | number | null;
};

export function listFieldsToPresentationInput(
  asset: OpportunityListFields
): OpportunityPresentationInput {
  return {
    name: asset.name,
    slug: asset.slug,
    city: asset.city,
    country: asset.country,
    siteType: asset.siteType,
    operator: asset.operator,
    operatorDisplay: asset.operatorDisplay,
    spaces: asset.spaces,
    leaseLabel: asset.leaseLabel,
    assetStatus: asset.assetStatus ?? "published",
    targetYieldPct: asset.targetYieldPct,
    minTicketEur: asset.minTicketEur,
    investmentOptions: asset.investmentOptions,
    commercialTermIds: asset.commercialTermIds,
    funding: asset.funding
  };
}

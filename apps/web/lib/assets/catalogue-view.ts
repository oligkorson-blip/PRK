/**
 * Pure catalogue view logic. Card display, sort, and filter all share one
 * basis so the figure on the card is the figure sort/filter use:
 * yield = band max ("Up to X%"), minimum = recommended option's minimum.
 */

import { yieldBand, type InvestmentOption } from "@/lib/assets/investment-options";
import { listFieldsToPresentationInput, type OpportunityListFields } from "@/lib/assets/list-fields";
import { buildOpportunityPresentation } from "@/lib/assets/presentation";

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

/** Neutral default is lowest minimum; unknown or missing values fall back to it. */
export function parseCatalogueSort(v: string | null): CatalogueSortKey {
  if (v === "min_asc" || v === "yield_desc" || v === "name_asc") return v;
  return "min_asc";
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

/** Published assets whose resolved status is fully funded (social-proof line). */
export function countFullyFunded(assets: OpportunityListFields[]): number {
  return assets.filter(
    (a) =>
      buildOpportunityPresentation(listFieldsToPresentationInput(a)).status.id ===
      "fully_funded"
  ).length;
}

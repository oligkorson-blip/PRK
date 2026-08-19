/**
 * Compact "big number, small caption" stat tiles shared by the detail-page
 * top row and the catalogue quick-view modal. Built only from fields that
 * exist on the asset row; provenance labels follow the Location block
 * convention (contracted / modelled / withheld) — nothing is invented.
 */

import { formatEur } from "@/lib/format";
import { provenanceHint, type MetricProvenance } from "@/lib/assets/metric-provenance";

export type StatTile = { label: string; value: string; hint: string | null };

export type StatTilesInput = {
  spaces: number;
  availableSpaces?: number | null;
  occupancyPct?: string | number | null;
  visitorsPerDay?: number | null;
  visitorsProvenance?: MetricProvenance;
  annualRevenueEur?: number | null;
  revenueProvenance?: MetricProvenance;
  termDisplay?: string | null;
};

function formatOccupancy(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`;
}

export function buildStatTiles(
  input: StatTilesInput,
  opts?: { includeTerm?: boolean; limit?: number }
): StatTile[] {
  const tiles: StatTile[] = [];

  const visitorsProvenance = input.visitorsProvenance ?? "withheld";
  if (visitorsProvenance !== "withheld" && input.visitorsPerDay != null) {
    tiles.push({
      label: "Visitors / day",
      value: input.visitorsPerDay.toLocaleString("en-IE"),
      hint: provenanceHint(visitorsProvenance)
    });
  }

  if (input.availableSpaces != null) {
    tiles.push({
      label: "Available spaces",
      value: input.availableSpaces.toLocaleString("en-IE"),
      hint: null
    });
  } else {
    tiles.push({
      label: "Parking spaces",
      value: input.spaces.toLocaleString("en-IE"),
      hint: null
    });
  }

  const revenueProvenance = input.revenueProvenance ?? "withheld";
  if (revenueProvenance !== "withheld" && input.annualRevenueEur != null) {
    tiles.push({
      label: "Annual revenue",
      value: formatEur(input.annualRevenueEur),
      hint: provenanceHint(revenueProvenance)
    });
  }

  const occupancy = formatOccupancy(input.occupancyPct);
  if (occupancy != null) {
    tiles.push({ label: "Occupancy", value: occupancy, hint: null });
  }

  if (opts?.includeTerm && input.termDisplay) {
    tiles.push({ label: "Target term", value: input.termDisplay, hint: null });
  }

  return typeof opts?.limit === "number" ? tiles.slice(0, opts.limit) : tiles;
}

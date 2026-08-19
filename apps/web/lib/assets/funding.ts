import { and, eq, inArray, sql } from "drizzle-orm";
import { db, holdings } from "@/lib/db";

export type FundingSnapshot = {
  capacityEur: number | null;
  committedEur: number;
  /** 0–100 when capacity is known; otherwise null */
  pct: number | null;
  label: string;
  open: boolean;
};

export function fundingFromAmounts(
  committedEur: number,
  capacityEur: number | null | undefined
): FundingSnapshot {
  const committed = Math.max(0, Math.round(committedEur));
  const capacity =
    typeof capacityEur === "number" && capacityEur > 0 ? Math.round(capacityEur) : null;

  if (!capacity) {
    return {
      capacityEur: null,
      committedEur: committed,
      pct: null,
      label: committed > 0 ? "Open — investing now" : "Open for investment",
      open: true
    };
  }

  const open = committed < capacity;
  // Cap at 99 while anything is uncommitted: Math.round would render 99.5%+
  // as "100% funded" while the status is still Open.
  const pct = open ? Math.min(99, Math.round((committed / capacity) * 100)) : 100;
  return {
    capacityEur: capacity,
    committedEur: committed,
    pct,
    label: open ? (pct === 0 ? "Open for investment" : `${pct}% funded`) : "Full",
    open
  };
}

/** Sum active holding tickets per asset id. */
export async function committedByAssetIds(
  assetIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (assetIds.length === 0) return map;

  const rows = await db
    .select({
      assetId: holdings.assetId,
      total: sql<number>`coalesce(sum(${holdings.amountEur}), 0)::int`
    })
    .from(holdings)
    .where(and(eq(holdings.status, "active"), inArray(holdings.assetId, assetIds)))
    .groupBy(holdings.assetId);

  for (const row of rows) {
    map.set(row.assetId, Number(row.total) || 0);
  }
  for (const id of assetIds) {
    if (!map.has(id)) map.set(id, 0);
  }
  return map;
}

export async function fundingForAssets(
  assets: { id: string; advisoryCapacityEur: number | null }[]
): Promise<Map<string, FundingSnapshot>> {
  const committed = await committedByAssetIds(assets.map((a) => a.id));
  const out = new Map<string, FundingSnapshot>();
  for (const asset of assets) {
    out.set(
      asset.id,
      fundingFromAmounts(committed.get(asset.id) ?? 0, asset.advisoryCapacityEur)
    );
  }
  return out;
}

import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/investor";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { assets, db, distributions, holdings, investors } from "@/lib/db";

/**
 * Read-side data access for the portfolio domain. Plain module (no
 * "use server"): runs inside server pages only; mutations live in
 * lib/portfolio/admin-distributions.ts.
 */

export async function listRecentDistributions(limit = 40) {
  const admin = await requireAdmin();

  const cappedLimit = Math.min(Math.max(1, Math.floor(limit)), 200);

  // Scope in SQL, not after the fact: the LIMIT must apply to rows the
  // caller can actually see, or out-of-book records eat an agent's "recent"
  // list (same book-scoping pattern as lib/interests/queries.ts).
  const bookScope =
    admin.role === "super_admin"
      ? undefined
      : admin.role === "ib"
        ? eq(investors.ibId, admin.staff.id)
        : eq(investors.assignedAgentId, admin.staff.id);

  return db
    .select({
      id: distributions.id,
      amountEur: distributions.amountEur,
      type: distributions.type,
      status: distributions.status,
      periodLabel: distributions.periodLabel,
      paidAt: distributions.paidAt,
      createdAt: distributions.createdAt,
      investorEmail: investors.email,
      investorId: investors.id,
      holdingId: holdings.id,
      assetName: assets.name
    })
    .from(distributions)
    .innerJoin(investors, eq(distributions.investorId, investors.id))
    .innerJoin(holdings, eq(distributions.holdingId, holdings.id))
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(bookScope)
    .orderBy(desc(distributions.createdAt))
    .limit(cappedLimit);
}

export async function listActiveHoldingsForAdmin() {
  const admin = await requireAdmin();

  // Scope in SQL before ordering and materializing rows so a staff member's
  // active holdings list cannot be displaced by records outside their book.
  const bookScope =
    admin.role === "super_admin"
      ? undefined
      : admin.role === "ib"
        ? eq(investors.ibId, admin.staff.id)
        : eq(investors.assignedAgentId, admin.staff.id);

  const rows = await db
    .select({
      id: holdings.id,
      amountEur: holdings.amountEur,
      investorEmail: investors.email,
      investorId: investors.id,
      assignedAgentId: investors.assignedAgentId,
      ibId: investors.ibId,
      assetName: assets.name
    })
    .from(holdings)
    .innerJoin(investors, eq(holdings.investorId, investors.id))
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(
      bookScope
        ? and(eq(holdings.status, "active"), bookScope)
        : eq(holdings.status, "active")
    )
    .orderBy(desc(holdings.confirmedAt));

  return rows.filter((r) =>
    investorVisibleToStaff({
      role: admin.role,
      staffId: admin.staff.id,
      investor: { assignedAgentId: r.assignedAgentId, ibId: r.ibId }
    })
  );
}

/**
 * Holdings ⨝ assets join for the investor portal (list + dashboard share it).
 * Session-scoped: callers pass the investor id from ensureInvestor().
 */
export async function listHoldingsWithAssets(investorId: string) {
  return db
    .select({
      id: holdings.id,
      amountEur: holdings.amountEur,
      targetYieldPct: holdings.targetYieldPct,
      status: holdings.status,
      confirmedAt: holdings.confirmedAt,
      assetName: assets.name,
      assetSlug: assets.slug,
      operator: assets.operator
    })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.investorId, investorId))
    .orderBy(desc(holdings.confirmedAt));
}

/** Single holding ⨝ asset for the portal holding detail page. */
export async function getHoldingWithAssetForInvestor(
  investorId: string,
  holdingId: string
) {
  const [row] = await db
    .select({
      id: holdings.id,
      amountEur: holdings.amountEur,
      targetYieldPct: holdings.targetYieldPct,
      status: holdings.status,
      confirmedAt: holdings.confirmedAt,
      assetName: assets.name,
      assetSlug: assets.slug,
      assetStatus: assets.status,
      city: assets.city,
      country: assets.country,
      spaces: assets.spaces,
      siteType: assets.siteType,
      artVariant: assets.artVariant,
      operator: assets.operator
    })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(and(eq(holdings.id, holdingId), eq(holdings.investorId, investorId)))
    .limit(1);
  return row ?? null;
}

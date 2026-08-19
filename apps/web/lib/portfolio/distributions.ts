import { and, desc, eq, sql } from "drizzle-orm";
import { db, distributions } from "@/lib/db";
import { formatEur } from "@/lib/format";

export type DistributionRow = {
  id: string;
  amountEur: number;
  type: string;
  status: string;
  periodLabel: string | null;
  paidAt: Date | null;
};

// The portal overview renders this list straight into the payment history
// panel — keep it bounded (50 ≈ four years of monthly payouts).
const INVESTOR_DISTRIBUTIONS_LIMIT = 50;

export async function listDistributionsForInvestor(investorId: string): Promise<DistributionRow[]> {
  const rows = await db
    .select({
      id: distributions.id,
      amountEur: distributions.amountEur,
      type: distributions.type,
      status: distributions.status,
      periodLabel: distributions.periodLabel,
      paidAt: distributions.paidAt
    })
    .from(distributions)
    .where(eq(distributions.investorId, investorId))
    .orderBy(sql`${distributions.paidAt} desc nulls last`, desc(distributions.createdAt))
    .limit(INVESTOR_DISTRIBUTIONS_LIMIT);

  return rows.map((r) => ({
    ...r,
    amountEur: Number(r.amountEur)
  }));
}

export async function sumPaidIncomeForInvestor(investorId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${distributions.amountEur}), 0)`
    })
    .from(distributions)
    .where(
      and(
        eq(distributions.investorId, investorId),
        eq(distributions.status, "paid"),
        eq(distributions.type, "income")
      )
    );
  return Number(row?.total ?? 0);
}

export async function listDistributionsForHolding(
  investorId: string,
  holdingId: string
): Promise<DistributionRow[]> {
  const rows = await db
    .select({
      id: distributions.id,
      amountEur: distributions.amountEur,
      type: distributions.type,
      status: distributions.status,
      periodLabel: distributions.periodLabel,
      paidAt: distributions.paidAt
    })
    .from(distributions)
    .where(and(eq(distributions.investorId, investorId), eq(distributions.holdingId, holdingId)))
    .orderBy(desc(distributions.paidAt), desc(distributions.createdAt));

  return rows.map((r) => ({
    ...r,
    amountEur: Number(r.amountEur)
  }));
}

export function sumPaidIncomeEur(rows: DistributionRow[]): number {
  return rows
    .filter((r) => r.status === "paid" && r.type === "income")
    .reduce((sum, r) => sum + r.amountEur, 0);
}

export { formatDistributionStatus, formatDistributionType } from "./distribution-labels";

export function formatDistributionAmount(amountEur: number): string {
  return formatEur(amountEur);
}

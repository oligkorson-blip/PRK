import { and, eq, isNull } from "drizzle-orm";
import { contracts, db, interests } from "@/lib/db";

export async function countConfirmedInterestsWithoutAgreementForInvestor(
  investorId: string
): Promise<number> {
  const rows = await db
    .select({ id: interests.id })
    .from(interests)
    .leftJoin(contracts, eq(contracts.interestId, interests.id))
    .where(
      and(
        eq(interests.investorId, investorId),
        eq(interests.status, "confirmed"),
        isNull(contracts.id)
      )
    );
  return rows.length;
}

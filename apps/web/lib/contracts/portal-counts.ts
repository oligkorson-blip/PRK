import { and, eq, notInArray } from "drizzle-orm";
import { contracts, db } from "@/lib/db";

const TERMINAL_CONTRACT_STATES = ["superseded", "withdrawn"] as const;

export async function countOpenAgreementsForInvestor(investorId: string): Promise<number> {
  const rows = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(
        eq(contracts.investorId, investorId),
        notInArray(contracts.state, [...TERMINAL_CONTRACT_STATES])
      )
    );
  return rows.length;
}

import { asc, desc, eq, inArray } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/staff";
import { db, investors, kycChecks } from "@/lib/db";
import type { KycCheckResult } from "./validation";

/**
 * Read-side data access for the AML domain. Plain module (no "use server"):
 * runs inside server pages only; the screening mutation stays in
 * lib/aml/actions.ts.
 */

export type AmlChecklistRow = {
  id: string;
  email: string;
  fullName: string;
  kycStatus: "not_started" | "submitted" | "under_review" | "approved" | "rejected";
  pepDeclaration: boolean | null;
  latestCheck: {
    id: string;
    result: KycCheckResult;
    screeningNote: string;
    sourceOfFundsNote: string | null;
    reviewedAt: Date;
  } | null;
};

/**
 * Latest screening result for one investor — the single source of truth for
 * "is this investor's most recent sanctions/PEP screening clear?". Recency
 * matches the AML checklist query below (reviewedAt desc, id desc), so equal
 * timestamps resolve deterministically the same way in both. `confirmInterest`
 * gates on this so the confirm path can never disagree with the checklist
 * UI (amlChecklistState), which also derives state from the latest row.
 */
export async function latestScreeningResult(
  investorId: string
): Promise<KycCheckResult | null> {
  const [row] = await db
    .select({ result: kycChecks.result })
    .from(kycChecks)
    .where(eq(kycChecks.investorId, investorId))
    .orderBy(desc(kycChecks.reviewedAt), desc(kycChecks.id))
    .limit(1);
  return row?.result ?? null;
}

/** Staff-scoped investor list with each investor's latest screening (admin AML checklist). */
export async function listAmlChecklistForStaff(): Promise<AmlChecklistRow[]> {
  const staff = await requireStaff();

  const base = db
    .select({
      id: investors.id,
      email: investors.email,
      fullName: investors.fullName,
      kycStatus: investors.kycStatus,
      pepDeclaration: investors.pepDeclaration
    })
    .from(investors);

  const rows =
    staff.role === "super_admin"
      ? await base.orderBy(asc(investors.email))
      : staff.role === "ib"
        ? await base.where(eq(investors.ibId, staff.staff.id)).orderBy(asc(investors.email))
        : await base
            .where(eq(investors.assignedAgentId, staff.staff.id))
            .orderBy(asc(investors.email));

  if (rows.length === 0) return [];

  const checks = await db
    .select({
      id: kycChecks.id,
      investorId: kycChecks.investorId,
      result: kycChecks.result,
      screeningNote: kycChecks.screeningNote,
      sourceOfFundsNote: kycChecks.sourceOfFundsNote,
      reviewedAt: kycChecks.reviewedAt
    })
    .from(kycChecks)
    .where(
      inArray(
        kycChecks.investorId,
        rows.map((r) => r.id)
      )
    )
    .orderBy(desc(kycChecks.reviewedAt), desc(kycChecks.id));

  const latestByInvestor = new Map<string, (typeof checks)[number]>();
  for (const check of checks) {
    if (!latestByInvestor.has(check.investorId)) {
      latestByInvestor.set(check.investorId, check);
    }
  }

  return rows.map((row) => {
    const latest = latestByInvestor.get(row.id);
    return {
      ...row,
      latestCheck: latest
        ? {
            id: latest.id,
            result: latest.result,
            screeningNote: latest.screeningNote,
            sourceOfFundsNote: latest.sourceOfFundsNote,
            reviewedAt: latest.reviewedAt
          }
        : null
    };
  });
}

import { eq, inArray } from "drizzle-orm";
import type { StaffRole } from "@/lib/auth/roles";
import { latestScreeningResult } from "@/lib/aml/queries";
import { committedByAssetIds, fundingFromAmounts } from "@/lib/assets/funding";
import {
  assets,
  db,
  interestConfirmationApprovals,
  interests,
  investors,
  staffProfiles
} from "@/lib/db";
import { fourEyesThresholdEur } from "@/lib/interests/four-eyes";
import {
  evaluateConfirmPreflight,
  type ConfirmPreflight
} from "@/lib/interests/confirm-preflight";

export async function getInterestConfirmPreflight(input: {
  interestId: string;
  staffRole: StaffRole;
}): Promise<ConfirmPreflight | null> {
  const map = await getInterestConfirmPreflightsForStaff({
    interestIds: [input.interestId],
    staffRole: input.staffRole
  });
  return map.get(input.interestId) ?? null;
}

/** Batch preflight for the pending interests table. */
export async function getInterestConfirmPreflightsForStaff(input: {
  interestIds: string[];
  staffRole: StaffRole;
}): Promise<Map<string, ConfirmPreflight>> {
  const out = new Map<string, ConfirmPreflight>();
  if (input.interestIds.length === 0) return out;

  const rows = await db
    .select({
      interestId: interests.id,
      interestStatus: interests.status,
      amountEur: interests.amountEur,
      assetId: assets.id,
      assetStatus: assets.status,
      advisoryCapacityEur: assets.advisoryCapacityEur,
      kycStatus: investors.kycStatus,
      accountStatus: investors.accountStatus,
      poolInvestmentsEnabled: investors.poolInvestmentsEnabled,
      investorId: investors.id,
      firstApproverEmail: staffProfiles.email
    })
    .from(interests)
    .innerJoin(assets, eq(interests.assetId, assets.id))
    .innerJoin(investors, eq(interests.investorId, investors.id))
    .leftJoin(
      interestConfirmationApprovals,
      eq(interestConfirmationApprovals.interestId, interests.id)
    )
    .leftJoin(staffProfiles, eq(staffProfiles.id, interestConfirmationApprovals.approvedByStaffId))
    .where(inArray(interests.id, input.interestIds));

  const assetIds = [...new Set(rows.map((r) => r.assetId))];
  const committed = await committedByAssetIds(assetIds);
  const threshold = fourEyesThresholdEur();

  for (const row of rows) {
    const funding = fundingFromAmounts(
      committed.get(row.assetId) ?? 0,
      row.advisoryCapacityEur
    );
    const latestAmlResult = await latestScreeningResult(row.investorId);
    out.set(
      row.interestId,
      evaluateConfirmPreflight({
        interestStatus: row.interestStatus,
        kycStatus: row.kycStatus,
        accountStatus: row.accountStatus,
        poolInvestmentsEnabled: row.poolInvestmentsEnabled,
        latestAmlResult,
        assetStatus: row.assetStatus,
        capacityOpen: funding.open,
        amountEur: row.amountEur,
        fourEyesThresholdEur: threshold,
        firstApproverEmail: row.firstApproverEmail,
        staffRole: input.staffRole
      })
    );
  }

  return out;
}

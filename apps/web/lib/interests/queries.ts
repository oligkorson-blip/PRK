import { and, asc, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import type { StaffRole } from "@/lib/auth/roles";
import { assets, contracts, db, interestConfirmationApprovals, interests, investors, staffProfiles } from "@/lib/db";

/**
 * Read-side data access for the interests domain. Plain module (no
 * "use server"): runs inside server pages only. Staff-scoped functions take
 * the already-authorized role/id explicitly — requireStaff stays in the page.
 */

/** Interests ⨝ assets for the investor's own portal list (session-scoped id). */
export async function listInterestsWithAssetsForInvestor(investorId: string) {
  return db
    .select({
      id: interests.id,
      amountEur: interests.amountEur,
      note: interests.note,
      status: interests.status,
      createdAt: interests.createdAt,
      assetName: assets.name,
      assetSlug: assets.slug,
      assetStatus: assets.status
    })
    .from(interests)
    .innerJoin(assets, eq(interests.assetId, assets.id))
    .where(eq(interests.investorId, investorId))
    .orderBy(desc(interests.createdAt));
}

/** Statuses of the investor's interests (portal dashboard pending count). */
export async function listInterestStatusesForInvestor(investorId: string) {
  return db
    .select({ status: interests.status })
    .from(interests)
    .where(eq(interests.investorId, investorId));
}

type StaffScope = { role: StaffRole; staffId: string };

function pendingWhere(scope: StaffScope) {
  return scope.role === "super_admin"
    ? eq(interests.status, "pending")
    : scope.role === "ib"
      ? and(eq(interests.status, "pending"), eq(investors.ibId, scope.staffId))
      : and(eq(interests.status, "pending"), eq(investors.assignedAgentId, scope.staffId));
}

/** Pending interest queue for staff, scoped to the caller's book. */
export async function listPendingInterestsForStaff(
  scope: StaffScope,
  opts?: { fourEyesOnly?: boolean }
) {
  const where = opts?.fourEyesOnly
    ? and(pendingWhere(scope), isNotNull(interestConfirmationApprovals.id))
    : pendingWhere(scope);

  return db
    .select({
      id: interests.id,
      amountEur: interests.amountEur,
      note: interests.note,
      createdAt: interests.createdAt,
      investorId: investors.id,
      investorEmail: investors.email,
      kycStatus: investors.kycStatus,
      assetName: assets.name,
      assetSlug: assets.slug,
      // Four-eyes: first approver's email when a second super admin approval is pending.
      firstApprovedByEmail: staffProfiles.email
    })
    .from(interests)
    .innerJoin(assets, eq(interests.assetId, assets.id))
    .innerJoin(investors, eq(interests.investorId, investors.id))
    .leftJoin(
      interestConfirmationApprovals,
      eq(interestConfirmationApprovals.interestId, interests.id)
    )
    .leftJoin(staffProfiles, eq(staffProfiles.id, interestConfirmationApprovals.approvedByStaffId))
    .where(where)
    .orderBy(asc(interests.createdAt));
}

/** Admin dashboard counts: pending interests, plus the KYC-blocked subset. */
export async function getPendingInterestCountsForStaff(
  scope: StaffScope
): Promise<{ pending: number; kycBlocked: number; fourEyesPending: number }> {
  const bookScope =
    scope.role === "ib"
      ? eq(investors.ibId, scope.staffId)
      : eq(investors.assignedAgentId, scope.staffId);

  const interestScope =
    scope.role === "super_admin"
      ? eq(interests.status, "pending")
      : and(eq(interests.status, "pending"), bookScope);

  const kycBlockedScope =
    scope.role === "super_admin"
      ? and(eq(interests.status, "pending"), ne(investors.kycStatus, "approved"))
      : and(eq(interests.status, "pending"), bookScope, ne(investors.kycStatus, "approved"));

  const fourEyesScope =
    scope.role === "super_admin"
      ? and(eq(interests.status, "pending"), isNotNull(interestConfirmationApprovals.id))
      : and(
          eq(interests.status, "pending"),
          bookScope,
          isNotNull(interestConfirmationApprovals.id)
        );

  const [pendingRows, kycBlockedRows, fourEyesRows] = await Promise.all([
    db
      .select({ id: interests.id })
      .from(interests)
      .innerJoin(investors, eq(interests.investorId, investors.id))
      .where(interestScope)
      .orderBy(asc(interests.createdAt)),
    db
      .select({ id: interests.id })
      .from(interests)
      .innerJoin(investors, eq(interests.investorId, investors.id))
      .where(kycBlockedScope),
    db
      .select({ id: interests.id })
      .from(interests)
      .innerJoin(investors, eq(interests.investorId, investors.id))
      .innerJoin(
        interestConfirmationApprovals,
        eq(interestConfirmationApprovals.interestId, interests.id)
      )
      .where(fourEyesScope)
  ]);

  return {
    pending: pendingRows.length,
    kycBlocked: kycBlockedRows.length,
    fourEyesPending: fourEyesRows.length
  };
}

/** Confirmed interests with no linked agreement (ops gap). */
export async function listConfirmedInterestsWithoutAgreement(scope: StaffScope) {
  const book =
    scope.role === "super_admin"
      ? eq(interests.status, "confirmed")
      : scope.role === "ib"
        ? and(eq(interests.status, "confirmed"), eq(investors.ibId, scope.staffId))
        : and(eq(interests.status, "confirmed"), eq(investors.assignedAgentId, scope.staffId));

  return db
    .select({
      id: interests.id,
      amountEur: interests.amountEur,
      createdAt: interests.createdAt,
      investorId: investors.id,
      investorEmail: investors.email,
      assetName: assets.name,
      assetSlug: assets.slug
    })
    .from(interests)
    .innerJoin(assets, eq(interests.assetId, assets.id))
    .innerJoin(investors, eq(interests.investorId, investors.id))
    .leftJoin(contracts, eq(contracts.interestId, interests.id))
    .where(and(book, isNull(contracts.id)))
    .orderBy(asc(interests.createdAt));
}

export async function countConfirmedInterestsWithoutAgreement(
  scope: StaffScope
): Promise<number> {
  const rows = await listConfirmedInterestsWithoutAgreement(scope);
  return rows.length;
}

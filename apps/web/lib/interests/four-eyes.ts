import { eq } from "drizzle-orm";
import { db, interestConfirmationApprovals } from "@/lib/db";

/**
 * Four-eyes control for confirm→holding: interests at/above the threshold
 * need two distinct super admin approvals. The first approval is a row in
 * interest_confirmation_approvals (unique per interest); the second super
 * admin's confirm consumes it inside the confirm transaction.
 */

export const FOUR_EYES_DEFAULT_THRESHOLD_EUR = 50_000;

/** Ticket size (integer euros) at/above which confirm needs a second super admin. */
export function fourEyesThresholdEur(): number {
  const raw = process.env.FOUR_EYES_THRESHOLD_EUR;
  if (!raw) return FOUR_EYES_DEFAULT_THRESHOLD_EUR;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : FOUR_EYES_DEFAULT_THRESHOLD_EUR;
}

export type PendingApproval = { id: string; approvedByStaffId: string };

type ApprovalStore = Pick<typeof db, "select" | "insert">;

/** The pending first approval for an interest, if any. */
export async function findPendingApproval(
  interestId: string,
  store: ApprovalStore = db
): Promise<PendingApproval | null> {
  const [row] = await store
    .select({
      id: interestConfirmationApprovals.id,
      approvedByStaffId: interestConfirmationApprovals.approvedByStaffId
    })
    .from(interestConfirmationApprovals)
    .where(eq(interestConfirmationApprovals.interestId, interestId))
    .limit(1);
  return row ?? null;
}

/**
 * Return the pending first approval, recording the caller's when none exists.
 * Two super admins racing the first click: the unique index on interest_id
 * arbitrates through ON CONFLICT DO NOTHING. Re-read the winner's row so the
 * loser becomes the second approver without aborting a caller-owned transaction.
 */
export async function findOrRecordFirstApproval(
  input: { interestId: string; staffId: string },
  store: ApprovalStore = db
): Promise<{ inserted: boolean; approval: PendingApproval }> {
  const existing = await findPendingApproval(input.interestId, store);
  if (existing) return { inserted: false, approval: existing };

  // Avoid raising 23505 inside a caller-owned transaction, which would abort
  // that transaction before it can adopt the concurrent winner.
  const [inserted] = await store
    .insert(interestConfirmationApprovals)
    .values({ interestId: input.interestId, approvedByStaffId: input.staffId })
    .onConflictDoNothing()
    .returning({
      id: interestConfirmationApprovals.id,
      approvedByStaffId: interestConfirmationApprovals.approvedByStaffId
    });
  if (inserted) return { inserted: true, approval: inserted };

  const raced = await findPendingApproval(input.interestId, store);
  if (raced) return { inserted: false, approval: raced };
  throw new Error("Could not record or load the first interest approval.");
}

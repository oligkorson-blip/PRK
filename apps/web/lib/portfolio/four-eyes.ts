import { and, eq } from "drizzle-orm";
import { db, distributionApprovals } from "@/lib/db";

/**
 * Four-eyes control for distribution posting/cancellation, mirroring
 * lib/interests/four-eyes.ts: at/above the shared threshold
 * (fourEyesThresholdEur) two distinct super admin approvals are needed. The
 * first approval is a row in distribution_approvals (unique per
 * action+subject); the second super admin's action consumes it inside the
 * mutation transaction. The subject is the derived idempotency key for
 * "record" (no distribution row exists yet) and the distribution id for
 * "cancel".
 */

export type DistributionApprovalAction = "record" | "cancel";

export type PendingDistributionApproval = { id: string; approvedByStaffId: string };

type ApprovalStore = Pick<typeof db, "select" | "insert">;

/** The pending first approval for an action+subject, if any. */
export async function findPendingDistributionApproval(
  action: DistributionApprovalAction,
  subjectKey: string,
  store: ApprovalStore = db
): Promise<PendingDistributionApproval | null> {
  const [row] = await store
    .select({
      id: distributionApprovals.id,
      approvedByStaffId: distributionApprovals.approvedByStaffId
    })
    .from(distributionApprovals)
    .where(
      and(
        eq(distributionApprovals.action, action),
        eq(distributionApprovals.subjectKey, subjectKey)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Return the pending first approval, recording the caller's when none exists.
 * Two super admins racing the first click: the unique action+subject index
 * arbitrates through ON CONFLICT DO NOTHING. Re-read the winner's row so the
 * loser becomes the second approver without aborting the surrounding transaction.
 */
export async function findOrRecordFirstDistributionApproval(
  input: {
    action: DistributionApprovalAction;
    subjectKey: string;
    staffId: string;
  },
  store: ApprovalStore = db
): Promise<{ inserted: boolean; approval: PendingDistributionApproval }> {
  const existing = await findPendingDistributionApproval(input.action, input.subjectKey, store);
  if (existing) return { inserted: false, approval: existing };

  // Keep concurrent first clicks safe inside a caller-owned transaction:
  // a conflict returns no row instead of aborting the transaction.
  const [inserted] = await store
    .insert(distributionApprovals)
    .values({
      action: input.action,
      subjectKey: input.subjectKey,
      approvedByStaffId: input.staffId
    })
    .onConflictDoNothing()
    .returning({
      id: distributionApprovals.id,
      approvedByStaffId: distributionApprovals.approvedByStaffId
    });
  if (inserted) return { inserted: true, approval: inserted };

  const raced = await findPendingDistributionApproval(input.action, input.subjectKey, store);
  if (raced) return { inserted: false, approval: raced };
  throw new Error("Could not record or load the first distribution approval.");
}

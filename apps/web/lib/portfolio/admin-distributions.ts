"use server";

import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/investor";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import {
  assets,
  auditEvents,
  db,
  distributionApprovals,
  distributions,
  holdings,
  investors
} from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { sendTransactionalEmail } from "@/lib/email/send";
import { formatEur } from "@/lib/format";
import { fourEyesThresholdEur } from "@/lib/interests/four-eyes";
import {
  findOrRecordFirstDistributionApproval,
  type PendingDistributionApproval
} from "./four-eyes";

export type AdminDistributionResult =
  | { ok: true; id?: string; pendingSecondApproval?: true }
  | { ok: false; error: string };

const DISTRIBUTION_TYPES = ["income", "return_of_capital", "other"] as const;
const DISTRIBUTION_STATUSES = ["scheduled", "paid", "failed", "cancelled"] as const;
const DISTRIBUTION_SCOPE_CHANGED = "DISTRIBUTION_SCOPE_CHANGED";
const HOLDING_NOT_ACTIVE_IN_TX = "HOLDING_NOT_ACTIVE_IN_TX";
const DISTRIBUTION_STATUS_CHANGED = "DISTRIBUTION_STATUS_CHANGED";

export async function recordDistribution(input: {
  holdingId: string;
  amountEur: number;
  type?: "income" | "return_of_capital" | "other";
  status?: "scheduled" | "paid" | "failed" | "cancelled";
  periodLabel?: string;
  paidAt?: string | null;
  note?: string | null;
}): Promise<AdminDistributionResult> {
  const admin = await requireAdmin();

  if (!Number.isInteger(input.amountEur) || input.amountEur <= 0) {
    return { ok: false, error: "Amount must be a positive whole number in EUR." };
  }
  if (input.amountEur > 10_000_000) {
    return { ok: false, error: "Amount looks too large. Check the figure." };
  }

  // Server actions can be invoked with arbitrary payloads — validate the
  // enums at runtime, not just via the TS signature.
  if (input.type !== undefined && !DISTRIBUTION_TYPES.includes(input.type)) {
    return { ok: false, error: "Invalid distribution type." };
  }
  if (input.status !== undefined && !DISTRIBUTION_STATUSES.includes(input.status)) {
    return { ok: false, error: "Invalid distribution status." };
  }

  const [row] = await db
    .select({
      holding: holdings,
      investor: investors
    })
    .from(holdings)
    .innerJoin(investors, eq(holdings.investorId, investors.id))
    .where(eq(holdings.id, input.holdingId))
    .limit(1);

  if (!row) {
    return { ok: false, error: "Investment not found." };
  }

  if (
    !investorVisibleToStaff({
      role: admin.role,
      staffId: admin.staff.id,
      investor: { assignedAgentId: row.investor.assignedAgentId, ibId: row.investor.ibId }
    })
  ) {
    return { ok: false, error: "You do not have access to this investor." };
  }

  if (row.holding.status !== "active") {
    return { ok: false, error: "Only active investments can receive distributions." };
  }

  const type = input.type ?? "income";
  const status = input.status ?? "paid";
  let paidAt: Date | null = null;
  if (status === "paid") {
    paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return { ok: false, error: "Paid date is invalid." };
    }
    if (paidAt.getTime() > Date.now()) {
      return { ok: false, error: "Paid date cannot be in the future." };
    }
  }

  const periodLabel = input.periodLabel?.trim() || null;
  if (!periodLabel) {
    return { ok: false, error: "Payment reference is required." };
  }
  if (periodLabel.length > 80) {
    return { ok: false, error: "Payment reference is too long." };
  }
  const note = input.note?.trim() || null;
  if (note && note.length > 500) {
    return { ok: false, error: "Note is too long." };
  }

  // Idempotency: every posting requires a payment reference. The admin form
  // submits straight from onSubmit with no per-render token, so derive a stable
  // key from the business fields plus that unique payment reference. A
  // double-submit or retry carries identical data and lands on the same key;
  // a genuinely new record differs in at least one of them.
  const idempotencyKey = [
    "record",
    row.holding.id,
    type,
    status,
    String(input.amountEur),
    periodLabel.toLowerCase()
  ].join(":");

  // Four-eyes: at/above the shared threshold (same as interest confirmation),
  // two distinct super admins must approve. The first approval only records
  // intent — nothing is posted and the investor is not emailed yet.
  const thresholdEur = fourEyesThresholdEur();
  let firstApproval: PendingDistributionApproval | null = null;
  if (input.amountEur >= thresholdEur) {
    if (admin.role !== "super_admin") {
      return {
        ok: false,
        error: `Distributions of ${formatEur(thresholdEur)} or more require two super admin approvals.`
      };
    }
    let first: Awaited<ReturnType<typeof findOrRecordFirstDistributionApproval>>;
    try {
      first = await db.transaction(async (tx) => {
        // Recheck staff scope and holding state while holding the investor
        // lock. A first approval is a state-changing authorization decision.
        const [lockedInvestor] = await tx
          .select({
            id: investors.id,
            assignedAgentId: investors.assignedAgentId,
            ibId: investors.ibId
          })
          .from(investors)
          .where(eq(investors.id, row.holding.investorId))
          .for("update");
        if (
          !lockedInvestor ||
          !investorVisibleToStaff({
            role: admin.role,
            staffId: admin.staff.id,
            investor: lockedInvestor
          })
        ) {
          throw new Error(DISTRIBUTION_SCOPE_CHANGED);
        }

        const [lockedHolding] = await tx
          .select({ id: holdings.id, status: holdings.status, investorId: holdings.investorId })
          .from(holdings)
          .where(eq(holdings.id, row.holding.id))
          .for("update");
        if (
          !lockedHolding ||
          lockedHolding.investorId !== lockedInvestor.id ||
          lockedHolding.status !== "active"
        ) {
          throw new Error(HOLDING_NOT_ACTIVE_IN_TX);
        }

        const approval = await findOrRecordFirstDistributionApproval(
          {
            action: "record",
            subjectKey: idempotencyKey,
            staffId: admin.staff.id
          },
          tx
        );
        if (approval.inserted) {
          await tx.insert(auditEvents).values({
            actorUserId: admin.id,
            action: "distribution.record_first_approval",
            entityType: "distribution",
            entityId: null,
            payload: {
              holdingId: row.holding.id,
              investorId: row.holding.investorId,
              amountEur: input.amountEur,
              type,
              status,
              thresholdEur,
              idempotencyKey
            }
          });
        }
        return approval;
      });
    } catch (error) {
      if (error instanceof Error && error.message === DISTRIBUTION_SCOPE_CHANGED) {
        return { ok: false, error: "You no longer have access to this investor. Refresh and try again." };
      }
      if (error instanceof Error && error.message === HOLDING_NOT_ACTIVE_IN_TX) {
        return { ok: false, error: "Only active investments can receive distributions." };
      }
      console.error("[distribution:recordFirstApproval]", error);
      return { ok: false, error: "Could not record the first approval. Please try again." };
    }
    if (first.inserted) {
      return { ok: true, pendingSecondApproval: true };
    }
    if (first.approval.approvedByStaffId === admin.staff.id) {
      return { ok: false, error: "A second super admin must approve this distribution." };
    }
    firstApproval = first.approval;
  }

  let created: { id: string };
  try {
    created = await db.transaction(async (tx) => {
      // Recheck staff scope and the holding's live state under row locks
      // immediately before inserting the ledger entry.
      const [lockedInvestor] = await tx
        .select({
          id: investors.id,
          assignedAgentId: investors.assignedAgentId,
          ibId: investors.ibId
        })
        .from(investors)
        .where(eq(investors.id, row.holding.investorId))
        .for("update");
      if (
        !lockedInvestor ||
        !investorVisibleToStaff({
          role: admin.role,
          staffId: admin.staff.id,
          investor: lockedInvestor
        })
      ) {
        throw new Error(DISTRIBUTION_SCOPE_CHANGED);
      }

      const [lockedHolding] = await tx
        .select({ id: holdings.id, status: holdings.status, investorId: holdings.investorId })
        .from(holdings)
        .where(eq(holdings.id, row.holding.id))
        .for("update");
      if (
        !lockedHolding ||
        lockedHolding.investorId !== lockedInvestor.id ||
        lockedHolding.status !== "active"
      ) {
        throw new Error(HOLDING_NOT_ACTIVE_IN_TX);
      }

      const [inserted] = await tx
        .insert(distributions)
        .values({
          investorId: row.holding.investorId,
          holdingId: row.holding.id,
          amountEur: input.amountEur,
          type,
          status,
          periodLabel,
          paidAt,
          note,
          idempotencyKey
        })
        .returning({ id: distributions.id });

      // Second super admin approved — the first approval is consumed.
      if (firstApproval) {
        await tx
          .delete(distributionApprovals)
          .where(eq(distributionApprovals.id, firstApproval.id));
      }

      await tx.insert(auditEvents).values({
        actorUserId: admin.id,
        action: "distribution.recorded",
        entityType: "distribution",
        entityId: inserted.id,
        payload: {
          holdingId: row.holding.id,
          investorId: row.holding.investorId,
          amountEur: input.amountEur,
          type,
          status,
          ...(firstApproval ? { firstApprovedByStaffId: firstApproval.approvedByStaffId } : {})
        }
      });

      return inserted;
    });
  } catch (error) {
    if (error instanceof Error && error.message === DISTRIBUTION_SCOPE_CHANGED) {
      return { ok: false, error: "You no longer have access to this investor. Refresh and try again." };
    }
    if (error instanceof Error && error.message === HOLDING_NOT_ACTIVE_IN_TX) {
      return { ok: false, error: "Only active investments can receive distributions." };
    }
    // The only unique index this insert can hit is the idempotency key (the
    // PK is defaultRandom): a 23505 here is a retry of an already-recorded
    // posting. Adopt the winner's row and skip the duplicate audit + email.
    if (!isUniqueViolation(error)) throw error;
    const [existing] = await db
      .select({ id: distributions.id })
      .from(distributions)
      .where(eq(distributions.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!existing) throw error;
    return { ok: true, id: existing.id };
  }

  try {
    const [assetRow] = await db
      .select({ name: assets.name })
      .from(assets)
      .where(eq(assets.id, row.holding.assetId))
      .limit(1);

    const assetName = assetRow?.name ?? "your parking investment";
    const amountLabel = formatEur(input.amountEur);
    const statusLabel =
      status === "paid" ? "has been recorded as paid" : `is now ${status}`;

    await sendTransactionalEmail({
      to: row.investor.email,
      subject: `Distribution update for ${assetName}`,
      text: [
        `A distribution of ${amountLabel} for ${assetName} ${statusLabel}.`,
        periodLabel ? `Period: ${periodLabel}.` : null,
        "View details in your Parkwise dashboard under Investments and payment history.",
        "Target income shown elsewhere is an estimate until paid.",
        "Capital at risk. Returns are not guaranteed."
      ]
        .filter(Boolean)
        .join(" ")
    });
  } catch (error) {
    console.error("[email:distribution.recorded]", error);
  }

  return { ok: true, id: created.id };
}

export type CancelDistributionResult =
  | { ok: true; pendingSecondApproval?: true }
  | { ok: false; error: string };

/**
 * Marks a recorded distribution as cancelled. Correction-only action — the
 * investor is deliberately NOT emailed (unlike recordDistribution).
 */
export async function cancelDistribution(input: {
  distributionId: string;
}): Promise<CancelDistributionResult> {
  const admin = await requireAdmin();

  const [row] = await db
    .select({
      id: distributions.id,
      status: distributions.status,
      amountEur: distributions.amountEur,
      investorId: distributions.investorId,
      assignedAgentId: investors.assignedAgentId,
      ibId: investors.ibId
    })
    .from(distributions)
    .innerJoin(investors, eq(distributions.investorId, investors.id))
    .where(eq(distributions.id, input.distributionId))
    .limit(1);

  if (!row) {
    return { ok: false, error: "Distribution not found." };
  }

  if (
    !investorVisibleToStaff({
      role: admin.role,
      staffId: admin.staff.id,
      investor: { assignedAgentId: row.assignedAgentId, ibId: row.ibId }
    })
  ) {
    return { ok: false, error: "You do not have access to this investor." };
  }

  if (row.status !== "scheduled" && row.status !== "paid") {
    return { ok: false, error: "Only scheduled or paid distributions can be cancelled." };
  }

  // Four-eyes: same threshold as recordDistribution — a large cancellation
  // needs a second, distinct super admin before it takes effect.
  const thresholdEur = fourEyesThresholdEur();
  let firstApproval: PendingDistributionApproval | null = null;
  if (row.amountEur >= thresholdEur) {
    if (admin.role !== "super_admin") {
      return {
        ok: false,
        error: `Cancelling distributions of ${formatEur(thresholdEur)} or more requires two super admin approvals.`
      };
    }
    let first: Awaited<ReturnType<typeof findOrRecordFirstDistributionApproval>>;
    try {
      first = await db.transaction(async (tx) => {
        // Recheck scope and cancellability while holding the investor and
        // distribution locks before recording the first approval.
        const [lockedInvestor] = await tx
          .select({
            id: investors.id,
            assignedAgentId: investors.assignedAgentId,
            ibId: investors.ibId
          })
          .from(investors)
          .where(eq(investors.id, row.investorId))
          .for("update");
        if (
          !lockedInvestor ||
          !investorVisibleToStaff({
            role: admin.role,
            staffId: admin.staff.id,
            investor: lockedInvestor
          })
        ) {
          throw new Error(DISTRIBUTION_SCOPE_CHANGED);
        }

        const [lockedDistribution] = await tx
          .select({ status: distributions.status })
          .from(distributions)
          .where(eq(distributions.id, row.id))
          .for("update");
        if (
          !lockedDistribution ||
          (lockedDistribution.status !== "scheduled" &&
            lockedDistribution.status !== "paid")
        ) {
          throw new Error(DISTRIBUTION_STATUS_CHANGED);
        }

        const approval = await findOrRecordFirstDistributionApproval(
          {
            action: "cancel",
            subjectKey: row.id,
            staffId: admin.staff.id
          },
          tx
        );
        if (approval.inserted) {
          await tx.insert(auditEvents).values({
            actorUserId: admin.id,
            action: "distribution.cancel_first_approval",
            entityType: "distribution",
            entityId: row.id,
            payload: { investorId: row.investorId, amountEur: row.amountEur, thresholdEur }
          });
        }
        return approval;
      });
    } catch (error) {
      if (error instanceof Error && error.message === DISTRIBUTION_SCOPE_CHANGED) {
        return { ok: false, error: "You no longer have access to this investor. Refresh and try again." };
      }
      if (error instanceof Error && error.message === DISTRIBUTION_STATUS_CHANGED) {
        return {
          ok: false,
          error: "Only scheduled or paid distributions can be cancelled."
        };
      }
      console.error("[distribution:cancelFirstApproval]", error);
      return { ok: false, error: "Could not record the first approval. Please try again." };
    }
    if (first.inserted) {
      return { ok: true, pendingSecondApproval: true };
    }
    if (first.approval.approvedByStaffId === admin.staff.id) {
      return { ok: false, error: "A second super admin must approve this cancellation." };
    }
    firstApproval = first.approval;
  }

  // Status change and audit row commit together or not at all. The expected
  // status predicate prevents concurrent cancellation attempts from both
  // succeeding against the same stale read.
  let cancelled: boolean;
  try {
    cancelled = await db.transaction(async (tx) => {
      // Lock the investor before checking scope so reassignment cannot land
      // between authorization and the guarded cancellation.
      const [lockedInvestor] = await tx
        .select({
          id: investors.id,
          assignedAgentId: investors.assignedAgentId,
          ibId: investors.ibId
        })
        .from(investors)
        .where(eq(investors.id, row.investorId))
        .for("update");
      if (
        !lockedInvestor ||
        !investorVisibleToStaff({
          role: admin.role,
          staffId: admin.staff.id,
          investor: lockedInvestor
        })
      ) {
        throw new Error(DISTRIBUTION_SCOPE_CHANGED);
      }

      const [lockedDistribution] = await tx
        .select({ status: distributions.status })
        .from(distributions)
        .where(eq(distributions.id, row.id))
        .for("update");
      if (!lockedDistribution || lockedDistribution.status !== row.status) {
        return false;
      }

      const updated = await tx
        .update(distributions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(distributions.id, row.id),
          eq(distributions.status, row.status)
        )
      )
      .returning({ id: distributions.id });

    if (updated.length !== 1) return false;

    // Second super admin approved — consume the first approval only after the
    // guarded status transition succeeds.
    if (firstApproval) {
      await tx
        .delete(distributionApprovals)
        .where(eq(distributionApprovals.id, firstApproval.id));
    }

    await tx.insert(auditEvents).values({
      actorUserId: admin.id,
      action: "distribution.cancelled",
      entityType: "distribution",
      entityId: row.id,
      payload: {
        investorId: row.investorId,
        previousStatus: row.status,
        ...(firstApproval ? { firstApprovedByStaffId: firstApproval.approvedByStaffId } : {})
      }
    });

      return true;
    });
  } catch (error) {
    if (error instanceof Error && error.message === DISTRIBUTION_SCOPE_CHANGED) {
      return {
        ok: false,
        error: "You no longer have access to this investor. Refresh and try again."
      };
    }
    throw error;
  }

  if (!cancelled) {
    return {
      ok: false,
      error: "Distribution status changed while you were reviewing it. Refresh and try again."
    };
  }

  return { ok: true };
}

export type BatchDistributionItem = {
  holdingId: string;
  amountEur: number;
};

export type BatchDistributionResult =
  | {
      ok: true;
      recorded: number;
      pendingSecondApproval: number;
      failures: Array<{ holdingId: string; error: string }>;
    }
  | { ok: false; error: string };

/**
 * Record the same type/status/period across multiple holdings (per-row amounts).
 * Each row still goes through recordDistribution (including four-eyes).
 */
export async function recordDistributionBatch(input: {
  items: BatchDistributionItem[];
  type?: "income" | "return_of_capital" | "other";
  status?: "scheduled" | "paid" | "failed" | "cancelled";
  periodLabel?: string;
  paidAt?: string | null;
  note?: string | null;
}): Promise<BatchDistributionResult> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Select at least one investment." };
  }
  if (input.items.length > 50) {
    return { ok: false, error: "Batch is limited to 50 investments at a time." };
  }

  let recorded = 0;
  let pendingSecondApproval = 0;
  const failures: Array<{ holdingId: string; error: string }> = [];

  for (const item of input.items) {
    const result = await recordDistribution({
      holdingId: item.holdingId,
      amountEur: item.amountEur,
      type: input.type,
      status: input.status,
      periodLabel: input.periodLabel,
      paidAt: input.paidAt,
      note: input.note
    });
    if (!result.ok) {
      failures.push({ holdingId: item.holdingId, error: result.error });
      continue;
    }
    if (result.pendingSecondApproval) pendingSecondApproval += 1;
    else recorded += 1;
  }

  if (recorded === 0 && pendingSecondApproval === 0 && failures.length > 0) {
    return {
      ok: false,
      error: failures[0]?.error ?? "No distributions were recorded."
    };
  }

  return { ok: true, recorded, pendingSecondApproval, failures };
}


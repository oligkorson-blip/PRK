"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/investor";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { latestScreeningResult } from "@/lib/aml/queries";
import { fundingFromAmounts } from "@/lib/assets/funding";
import {
  assets,
  auditEvents,
  db,
  holdings,
  interestConfirmationApprovals,
  interests,
  investors,
  kycChecks
} from "@/lib/db";
import { formatEur } from "@/lib/format";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  INTEREST_NOT_PENDING,
  interpretPendingClaim,
  wherePendingInterest
} from "./claim-pending";
import {
  findOrRecordFirstApproval,
  fourEyesThresholdEur,
  type PendingApproval
} from "./four-eyes";
import { assertTransition } from "./transitions";
import { validateInterestNote } from "./validation";
import { findOption, type InvestmentOption } from "@/lib/assets/investment-options";

export type AdminInterestActionResult =
  | { ok: true; pendingSecondApproval?: true }
  | { ok: false; error: string };

// Sentinels thrown inside the confirm transaction and mapped to clean
// { ok: false } errors in the catch below, mirroring INTEREST_NOT_PENDING.
const ASSET_NOT_OPEN = "ASSET_NOT_OPEN";
const ASSET_OVER_CAPACITY = "ASSET_OVER_CAPACITY";
const AML_NOT_CLEAR_IN_TX = "AML_NOT_CLEAR_IN_TX";
const INTEREST_SCOPE_CHANGED = "INTEREST_SCOPE_CHANGED";
const INVESTOR_NOT_ELIGIBLE_IN_TX = "INVESTOR_NOT_ELIGIBLE_IN_TX";

const AML_NOT_CLEAR_ERROR =
  "AML screening not clear. Record a clear sanctions/PEP screening before confirming.";

async function loadInterestWithContext(interestId: string) {
  const [row] = await db
    .select({ interest: interests, asset: assets, investor: investors })
    .from(interests)
    .innerJoin(assets, eq(interests.assetId, assets.id))
    .innerJoin(investors, eq(interests.investorId, investors.id))
    .where(eq(interests.id, interestId))
    .limit(1);
  return row;
}

function assertInterestVisibleToStaff(
  staff: { role: "super_admin" | "ib" | "agent"; staff: { id: string } },
  investor: { assignedAgentId: string | null; ibId: string | null }
): AdminInterestActionResult | null {
  if (!investorVisibleToStaff({ role: staff.role, staffId: staff.staff.id, investor })) {
    return { ok: false, error: "You do not have access to this investor's interest." };
  }
  return null;
}

export async function confirmInterest(input: {
  interestId: string;
  adminNote?: string | null;
}): Promise<AdminInterestActionResult> {
  const admin = await requireAdmin();
  const actorUserId = admin.id;

  const row = await loadInterestWithContext(input.interestId);
  if (!row) {
    return { ok: false, error: "Interest not found." };
  }
  const { interest, asset, investor } = row;

  const denied = assertInterestVisibleToStaff(admin, investor);
  if (denied) return denied;

  if (investor.kycStatus !== "approved") {
    return {
      ok: false,
      error: "KYC not approved. Investor must finish KYC before confirmation."
    };
  }

  // R6: the LATEST sanctions/PEP screening must be clear before confirm→holding.
  // Mirrors amlChecklistState (lib/aml/state.ts): a historical clear superseded
  // by a later review/rejected screening must not carry the confirmation —
  // latestScreeningResult is the same "latest row" the checklist UI reads.
  // KYC-doc rounds are covered by the kycStatus check above: setKycStatus and
  // the resubmit path move kycStatus off "approved", so a stale clear from a
  // prior docs round cannot pass this gate until KYC is re-approved. That is
  // simpler and strictly safer than comparing screening vs docs timestamps.
  // Fast path only — the authoritative re-check runs inside the claim
  // transaction below, so a screening recorded after this point still
  // stops the confirmation.
  const latestResult = await latestScreeningResult(investor.id);
  if (latestResult !== "clear") {
    return {
      ok: false,
      error: AML_NOT_CLEAR_ERROR
    };
  }

  try {
    assertTransition(interest.status, "confirmed");
  } catch {
    return { ok: false, error: `This interest is already ${interest.status} and can no longer be confirmed.` };
  }

  const noteResult = validateInterestNote(input.adminNote);
  if (!noteResult.ok) {
    return { ok: false, error: noteResult.error };
  }
  const now = new Date();

  // Four-eyes: at/above the threshold, two distinct super admins must approve.
  // The first approval only records intent — no holding is created yet.
  const thresholdEur = fourEyesThresholdEur();
  let firstApproval: PendingApproval | null = null;
  if (interest.amountEur >= thresholdEur) {
    if (admin.role !== "super_admin") {
      return {
        ok: false,
        error: `Confirmations of ${formatEur(thresholdEur)} or more require two super admin approvals.`
      };
    }
    let first: Awaited<ReturnType<typeof findOrRecordFirstApproval>>;
    try {
      first = await db.transaction(async (tx) => {
        // Recheck authorization and eligibility while holding the investor
        // lock. A first approval is still a state-changing staff action.
        const [lockedInvestor] = await tx
          .select({
            id: investors.id,
            assignedAgentId: investors.assignedAgentId,
            ibId: investors.ibId,
            accountStatus: investors.accountStatus,
            kycStatus: investors.kycStatus
          })
          .from(investors)
          .where(eq(investors.id, investor.id))
          .for("update");
        if (
          !lockedInvestor ||
          !investorVisibleToStaff({
            role: admin.role,
            staffId: admin.staff.id,
            investor: {
              assignedAgentId: lockedInvestor.assignedAgentId,
              ibId: lockedInvestor.ibId
            }
          })
        ) {
          throw new Error(INTEREST_SCOPE_CHANGED);
        }
        if (
          lockedInvestor.accountStatus !== "active" ||
          lockedInvestor.kycStatus !== "approved"
        ) {
          throw new Error(INVESTOR_NOT_ELIGIBLE_IN_TX);
        }

        const [freshInterest] = await tx
          .select({ status: interests.status })
          .from(interests)
          .where(eq(interests.id, interest.id))
          .for("update");
        if (!freshInterest || freshInterest.status !== "pending") {
          throw new Error(INTEREST_NOT_PENDING);
        }

        const [latest] = await tx
          .select({ result: kycChecks.result })
          .from(kycChecks)
          .where(eq(kycChecks.investorId, investor.id))
          .orderBy(desc(kycChecks.reviewedAt), desc(kycChecks.id))
          .limit(1);
        if (!latest || latest.result !== "clear") {
          throw new Error(AML_NOT_CLEAR_IN_TX);
        }

        const approval = await findOrRecordFirstApproval(
          {
            interestId: interest.id,
            staffId: admin.staff.id
          },
          tx
        );
        if (approval.inserted) {
          await tx.insert(auditEvents).values({
            actorUserId,
            action: "interest.confirm_first_approval",
            entityType: "interest",
            entityId: interest.id,
            payload: { assetSlug: asset.slug, amountEur: interest.amountEur, thresholdEur }
          });
        }
        return approval;
      });
    } catch (error) {
      if (error instanceof Error && error.message === INTEREST_NOT_PENDING) {
        return {
          ok: false,
          error: "This interest is no longer pending and can no longer be confirmed."
        };
      }
      if (error instanceof Error && error.message === INTEREST_SCOPE_CHANGED) {
        return {
          ok: false,
          error: "You no longer have access to this investor's interest. Refresh and try again."
        };
      }
      if (error instanceof Error && error.message === INVESTOR_NOT_ELIGIBLE_IN_TX) {
        return {
          ok: false,
          error: "The investor is no longer eligible for confirmation. Refresh and try again."
        };
      }
      if (error instanceof Error && error.message === AML_NOT_CLEAR_IN_TX) {
        return { ok: false, error: AML_NOT_CLEAR_ERROR };
      }
      console.error("[interest:confirmFirstApproval]", error);
      return { ok: false, error: "Could not record the first approval. Please try again." };
    }
    if (first.inserted) {
      return { ok: true, pendingSecondApproval: true };
    }
    if (first.approval.approvedByStaffId === admin.staff.id) {
      return { ok: false, error: "A second super admin must approve this confirmation." };
    }
    firstApproval = first.approval;
  }

  try {
    await db.transaction(async (tx) => {
      // Re-verify authorization and investor eligibility while holding
      // the investor row lock. This serializes reassignment/KYC/AML changes
      // with the claim that creates the holding.
      const [lockedInvestor] = await tx
        .select({
          id: investors.id,
          assignedAgentId: investors.assignedAgentId,
          ibId: investors.ibId,
          accountStatus: investors.accountStatus,
          kycStatus: investors.kycStatus
        })
        .from(investors)
        .where(eq(investors.id, investor.id))
        .for("update");
      if (
        !lockedInvestor ||
        !investorVisibleToStaff({
          role: admin.role,
          staffId: admin.staff.id,
          investor: {
            assignedAgentId: lockedInvestor.assignedAgentId,
            ibId: lockedInvestor.ibId
          }
        })
      ) {
        throw new Error(INTEREST_SCOPE_CHANGED);
      }
      if (
        lockedInvestor.accountStatus !== "active" ||
        lockedInvestor.kycStatus !== "approved"
      ) {
        throw new Error(INVESTOR_NOT_ELIGIBLE_IN_TX);
      }

      // Locking the asset row serializes concurrent confirmations on the
      // capacity check.
      const [freshAsset] = await tx
        .select({ status: assets.status, advisoryCapacityEur: assets.advisoryCapacityEur })
        .from(assets)
        .where(eq(assets.id, asset.id))
        .limit(1)
        .for("update");
      if (!freshAsset || freshAsset.status !== "published") {
        throw new Error(ASSET_NOT_OPEN);
      }

      // Same capacity math as createInterest (lib/assets/funding.ts), but the
      // ticket itself must fit: confirming must not push committed past the
      // stated capacity.
      const [committedRow] = await tx
        .select({ total: sql<number>`coalesce(sum(${holdings.amountEur}), 0)::int` })
        .from(holdings)
        .where(and(eq(holdings.status, "active"), eq(holdings.assetId, asset.id)));
      const funding = fundingFromAmounts(
        Number(committedRow?.total) || 0,
        freshAsset.advisoryCapacityEur
      );
      if (funding.capacityEur !== null && funding.committedEur + interest.amountEur > funding.capacityEur) {
        throw new Error(ASSET_OVER_CAPACITY);
      }

      // TOCTOU guard: the latest screening must still be clear at claim time
      // (same "latest row" query as latestScreeningResult, on the tx).
      const [latest] = await tx
        .select({ result: kycChecks.result })
        .from(kycChecks)
        .where(eq(kycChecks.investorId, investor.id))
        .orderBy(desc(kycChecks.reviewedAt), desc(kycChecks.id))
        .limit(1);
      if (!latest || latest.result !== "clear") {
        throw new Error(AML_NOT_CLEAR_IN_TX);
      }

      const claimed = await tx
        .update(interests)
        .set({
          status: "confirmed",
          adminNote: noteResult.note,
          decidedBy: actorUserId,
          decidedAt: now,
          updatedAt: now
        })
        .where(wherePendingInterest(interest.id))
        .returning({ id: interests.id });

      if (!interpretPendingClaim(claimed).claimed) {
        throw new Error(INTEREST_NOT_PENDING);
      }

      await tx.insert(holdings).values({
        investorId: investor.id,
        assetId: asset.id,
        interestId: interest.id,
        amountEur: interest.amountEur,
        targetYieldPct: (() => {
          const options = (asset.investmentOptions ?? []) as InvestmentOption[];
          const selected = findOption(options, interest.optionId);
          return selected ? selected.yieldPct.toFixed(2) : asset.targetYieldPct;
        })(),
        confirmedAt: now
      });

      // Second super admin confirmed — the first approval is consumed.
      if (firstApproval) {
        await tx
          .delete(interestConfirmationApprovals)
          .where(eq(interestConfirmationApprovals.id, firstApproval.id));
      }

      await tx.insert(auditEvents).values({
        actorUserId,
        action: "interest.confirmed",
        entityType: "interest",
        entityId: interest.id,
        payload: {
          assetSlug: asset.slug,
          amountEur: interest.amountEur,
          adminNote: noteResult.note,
          ...(firstApproval ? { firstApprovedByStaffId: firstApproval.approvedByStaffId } : {})
        }
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === INTEREST_NOT_PENDING) {
      return {
        ok: false,
        error: "This interest is no longer pending and can no longer be confirmed."
      };
    }
    if (error instanceof Error && error.message === ASSET_NOT_OPEN) {
      return {
        ok: false,
        error: "This asset is no longer open for investment, so this interest can no longer be confirmed."
      };
    }
    if (error instanceof Error && error.message === ASSET_OVER_CAPACITY) {
      return {
        ok: false,
        error: "Confirming this interest would exceed the asset's stated capacity."
      };
    }
    if (error instanceof Error && error.message === AML_NOT_CLEAR_IN_TX) {
      return { ok: false, error: AML_NOT_CLEAR_ERROR };
    }
    if (error instanceof Error && error.message === INTEREST_SCOPE_CHANGED) {
      return {
        ok: false,
        error: "You no longer have access to this investor's interest. Refresh and try again."
      };
    }
    if (error instanceof Error && error.message === INVESTOR_NOT_ELIGIBLE_IN_TX) {
      return {
        ok: false,
        error: "The investor is no longer eligible for confirmation. Refresh and try again."
      };
    }
    // Best-effort failure audit: the confirmation already failed, so a
    // secondary failure writing the audit row must not turn this clean
    // { ok: false } return into a raw throw. Log the gap instead — the
    // original error is surfaced to the admin below.
    try {
      await db.insert(auditEvents).values({
        actorUserId,
        action: "interest.confirm_holding_failed",
        entityType: "interest",
        entityId: interest.id,
        payload: { message: error instanceof Error ? error.message : String(error) }
      });
    } catch (auditError) {
      console.error("[interest:confirm_holding_failed audit]", auditError);
    }
    return {
      ok: false,
      error: "Confirming the interest and creating the holding failed. Please check the audit log."
    };
  }

  try {
    await sendTransactionalEmail({
      to: investor.email,
      subject: `Your interest in ${asset.name} has been confirmed`,
      text: `Your interest of ${formatEur(interest.amountEur)} in ${asset.name} is now confirmed. It appears in your dashboard under Investments. Capital is at risk; target returns are never guaranteed.`
    });
  } catch (error) {
    console.error("[email:interest.confirmed]", error);
  }

  return { ok: true };
}

export async function declineInterest(input: {
  interestId: string;
  /** Internal decision note — stored on the interest and in the audit log, never sent to the investor. */
  adminNote?: string | null;
  /** Optional message quoted verbatim in the decline email to the investor. */
  investorMessage?: string | null;
}): Promise<AdminInterestActionResult> {
  const admin = await requireAdmin();
  const actorUserId = admin.id;

  const row = await loadInterestWithContext(input.interestId);
  if (!row) {
    return { ok: false, error: "Interest not found." };
  }
  const { interest, asset, investor } = row;

  const denied = assertInterestVisibleToStaff(admin, investor);
  if (denied) return denied;

  try {
    assertTransition(interest.status, "declined");
  } catch {
    return { ok: false, error: `This interest is already ${interest.status} and can no longer be declined.` };
  }

  const noteResult = validateInterestNote(input.adminNote);
  if (!noteResult.ok) {
    return { ok: false, error: noteResult.error };
  }
  // The investor-facing message is validated separately from the internal
  // note: only this field is ever interpolated into the decline email.
  const messageResult = validateInterestNote(input.investorMessage);
  if (!messageResult.ok) {
    return { ok: false, error: `Message to the investor: ${messageResult.error}` };
  }
  const now = new Date();

  // Claiming the pending interest and recording its audit event are one
  // operation. If audit persistence fails, the status change rolls back too.
  let declined: boolean;
  try {
    declined = await db.transaction(async (tx) => {
      // Scope must be checked under the same investor lock as the status
      // transition. The outer read is only a fast rejection path.
      const [lockedInvestor] = await tx
        .select({
          assignedAgentId: investors.assignedAgentId,
          ibId: investors.ibId
        })
        .from(investors)
        .where(eq(investors.id, investor.id))
        .for("update");
      if (
        !lockedInvestor ||
        !investorVisibleToStaff({
          role: admin.role,
          staffId: admin.staff.id,
          investor: lockedInvestor
        })
      ) {
        throw new Error(INTEREST_SCOPE_CHANGED);
      }

      const claimed = await tx
        .update(interests)
      .set({
        status: "declined",
        adminNote: noteResult.note,
        decidedBy: actorUserId,
        decidedAt: now,
        updatedAt: now
      })
      .where(wherePendingInterest(interest.id))
      .returning({ id: interests.id });

    if (!interpretPendingClaim(claimed).claimed) {
      return false;
    }

    await tx.insert(auditEvents).values({
      actorUserId,
      action: "interest.declined",
      entityType: "interest",
      entityId: interest.id,
      payload: {
        assetSlug: asset.slug,
        amountEur: interest.amountEur,
        adminNote: noteResult.note,
        investorMessage: messageResult.note
      }
    });

      return true;
    });
  } catch (error) {
    if (error instanceof Error && error.message === INTEREST_SCOPE_CHANGED) {
      return {
        ok: false,
        error: "You no longer have access to this investor's interest. Refresh and try again."
      };
    }
    throw error;
  }

  if (!declined) {
    return {
      ok: false,
      error: "This interest is no longer pending and can no longer be declined."
    };
  }

  const opsInbox = process.env.OPS_INBOX_EMAIL;
  try {
    await sendTransactionalEmail({
      to: investor.email,
      subject: `Update on your interest in ${asset.name}`,
      // Only the dedicated investor-facing message is quoted here — the
      // internal admin note stays on the record and in the audit log.
      text: `We couldn't confirm your interest of ${formatEur(interest.amountEur)} in ${asset.name} this time.${
        messageResult.note ? ` Message from the team: ${messageResult.note}` : ""
      } Questions? Just reply to this email.`,
      ...(opsInbox ? { replyTo: opsInbox } : {})
    });
  } catch (error) {
    console.error("[email:interest.declined]", error);
  }

  return { ok: true };
}

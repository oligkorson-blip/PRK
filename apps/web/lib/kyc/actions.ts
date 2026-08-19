"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureInvestor, requireAdmin } from "@/lib/auth/investor";
import { isOnboardingComplete, requireCompletedOnboarding } from "@/lib/auth/gates";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { auditEvents, db, documents, investors } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/send";
import { buildObjectKey, deleteObject, isStorageConfigured, putObject } from "@/lib/storage/local";
import { sniffMatchesType } from "@/lib/storage/sniff";
import { validateOpsRejectNote } from "@/lib/ops/reject-note";
import { isUuid } from "@/lib/format";
import {
  KYC_COMPANY_REQUIREMENTS,
  KYC_DOCUMENT_CHANGE_ERROR,
  KYC_DOCUMENTS_LOCKED,
  KYC_DOCUMENT_SAVE_ERROR,
  KYC_SUBMIT_CONNECTION_ERROR,
  KYC_UPLOAD_CONNECTION_ERROR,
  KYC_UPLOAD_UNAVAILABLE
} from "@/lib/copy/kyc";

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * Investor-facing copy for a KYC decision. Only terminal decisions email the
 * investor — `under_review`/`submitted` are internal states. The footer
 * matches the capital-at-risk convention used by other investor emails.
 */
function kycDecisionEmail(input: {
  status: "approved" | "rejected";
  reason: string | null;
}): { subject: string; text: string } {
  if (input.status === "rejected") {
    return {
      subject: "Action needed: your identity verification",
      text: [
        "We could not approve your identity verification this time.",
        input.reason ? `Reason: ${input.reason}.` : null,
        `You can upload new documents and resubmit here: ${appOrigin()}/portal/kyc`,
        "Capital at risk. Returns are not guaranteed."
      ]
        .filter(Boolean)
        .join(" ")
    };
  }
  return {
    subject: "Your identity verification is approved",
    text: [
      "Your identity verification has been approved.",
      "Your Parkwise dashboard is now fully open for investing.",
      "Capital at risk. Returns are not guaranteed."
    ].join(" ")
  };
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_CATEGORIES = new Set(["kyc_id", "kyc_address", "kyc_company", "kyc_source_funds", "kyc_other"]);

/**
 * Server-side KYC state machine, mirroring the client-side gating in
 * lib/investors/next-action.ts: staff may only act on a live submission.
 * Moving on from a rejection happens investor-side via submitKycForReview.
 */
const KYC_STATUS_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  submitted: new Set(["under_review", "approved", "rejected"]),
  under_review: new Set(["approved", "rejected"])
};

export async function uploadKycDocument(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const investor = await ensureInvestor();
  try {
    requireCompletedOnboarding(investor);
  } catch {
    return { ok: false, error: "Complete onboarding before uploading documents." };
  }
  if (investor.accountStatus !== "active") {
    return { ok: false, error: "Your account is not active." };
  }
  if (investor.kycStatus !== "not_started" && investor.kycStatus !== "rejected") {
    return { ok: false, error: KYC_DOCUMENTS_LOCKED };
  }
  if (!isStorageConfigured()) {
    return { ok: false, error: KYC_UPLOAD_UNAVAILABLE };
  }

  const rawCategory = String(formData.get("category") ?? "kyc_other");
  const category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : "kyc_other";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file." };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "File must be 10 MB or smaller." };
  if (!ALLOWED.has(file.type)) return { ok: false, error: "PDF, JPEG, or PNG only." };
  if (!(await sniffMatchesType(file, file.type))) {
    return { ok: false, error: "File content does not match its type." };
  }

  // Retracted rows read as gone everywhere else — they must not hold a cap slot.
  const ownerFilter = and(
    eq(documents.ownerType, "investor"),
    eq(documents.ownerId, investor.id),
    isNull(documents.retractedAt)
  );
  const existing = await db.select({ id: documents.id }).from(documents).where(ownerFilter);
  if (existing.length >= 10) return { ok: false, error: "You can upload up to 10 files." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = buildObjectKey({
    ownerType: "investor",
    ownerId: investor.id,
    filename: file.name
  });
  try {
    await putObject(storageKey, buffer, file.type);
  } catch (err) {
    console.error("[storage:put]", err);
    return { ok: false, error: KYC_UPLOAD_CONNECTION_ERROR };
  }

  try {
    // Lock the investor row so concurrent uploads serialize on the cap check.
    const doc = await db.transaction(async (tx) => {
      const [lockedInvestor] = await tx
        .select({
          id: investors.id,
          accountStatus: investors.accountStatus,
          onboardingStatus: investors.onboardingStatus,
          termsAcceptedAt: investors.termsAcceptedAt,
          riskAcceptedAt: investors.riskAcceptedAt,
          kycStatus: investors.kycStatus
        })
        .from(investors)
        .where(eq(investors.id, investor.id))
        .for("update");

      // Recheck every investor gate while holding the row lock. The session
      // snapshot and the preflight cap query can both be stale by this point.
      if (!lockedInvestor) {
        throw new Error("KYC_UPLOAD_LOCKED");
      }
      if (lockedInvestor.accountStatus !== "active") {
        throw new Error("KYC_UPLOAD_INACTIVE");
      }
      if (!isOnboardingComplete(lockedInvestor)) {
        throw new Error("KYC_UPLOAD_ONBOARDING_INCOMPLETE");
      }
      if (
        lockedInvestor.kycStatus !== "not_started" &&
        lockedInvestor.kycStatus !== "rejected"
      ) {
        throw new Error("KYC_UPLOAD_LOCKED");
      }
      const count = await tx.select({ id: documents.id }).from(documents).where(ownerFilter);
      if (count.length >= 10) throw new Error("KYC_CAP_EXCEEDED");
      const [inserted] = await tx
        .insert(documents)
        .values({
          ownerType: "investor",
          ownerId: investor.id,
          title: file.name,
          category,
          storageKey,
          contentType: file.type,
          uploadedBy: investor.authUserId ?? investor.id
        })
        .returning();
      await tx.insert(auditEvents).values({
        actorUserId: investor.authUserId ?? "unknown",
        action: "kyc.document_uploaded",
        entityType: "investor",
        entityId: investor.id,
        payload: { documentId: inserted.id, category, contentType: file.type }
      });
      return inserted;
    });

    revalidatePath("/portal/kyc");
    return { ok: true, id: doc.id };
  } catch (err) {
    await deleteObject(storageKey).catch((cleanupErr) => {
      console.error("[storage:cleanup]", cleanupErr);
    });
    if (err instanceof Error && err.message === "KYC_CAP_EXCEEDED") {
      return { ok: false, error: "You can upload up to 10 files." };
    }
    if (err instanceof Error && err.message === "KYC_UPLOAD_INACTIVE") {
      return { ok: false, error: "Your account is not active." };
    }
    if (err instanceof Error && err.message === "KYC_UPLOAD_ONBOARDING_INCOMPLETE") {
      return { ok: false, error: "Complete onboarding before uploading documents." };
    }
    if (err instanceof Error && err.message === "KYC_UPLOAD_LOCKED") {
      return { ok: false, error: KYC_DOCUMENTS_LOCKED };
    }
    console.error("[kyc:upload]", err);
    return { ok: false, error: KYC_DOCUMENT_SAVE_ERROR };
  }
}

/**
 * Soft-remove one of the investor's own uploaded files before review starts.
 * The row and storage object stay available to staff for audit; it is simply
 * excluded from the investor's active pack and future submission checks.
 */
export async function removeKycDocument(
  documentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const investor = await ensureInvestor();
  try {
    requireCompletedOnboarding(investor);
  } catch {
    return { ok: false, error: "Complete onboarding before managing documents." };
  }
  if (investor.accountStatus !== "active") {
    return { ok: false, error: "Your account is not active." };
  }
  if (!isUuid(documentId)) {
    return { ok: false, error: "Document not found." };
  }
  if (investor.kycStatus !== "not_started" && investor.kycStatus !== "rejected") {
    return { ok: false, error: "Documents can no longer be changed while they are under review." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize document changes with submission and staff decisions.
      const [lockedInvestor] = await tx
        .select({ accountStatus: investors.accountStatus, kycStatus: investors.kycStatus })
        .from(investors)
        .where(eq(investors.id, investor.id))
        .for("update");

      if (!lockedInvestor || lockedInvestor.accountStatus !== "active") {
        return { ok: false as const, error: "Your account is not active." };
      }
      if (lockedInvestor.kycStatus !== "not_started" && lockedInvestor.kycStatus !== "rejected") {
        return {
          ok: false as const,
          error: "Documents can no longer be changed while they are under review."
        };
      }

      const [doc] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.id, documentId),
            eq(documents.ownerType, "investor"),
            eq(documents.ownerId, investor.id),
            isNull(documents.retractedAt)
          )
        )
        .limit(1);
      if (!doc) {
        return { ok: false as const, error: "Document not found." };
      }

      await tx
        .update(documents)
        .set({ retractedAt: new Date() })
        .where(eq(documents.id, doc.id));

      await tx.insert(auditEvents).values({
        actorUserId: investor.authUserId ?? "unknown",
        action: "kyc.document_removed",
        entityType: "investor",
        entityId: investor.id,
        payload: { documentId: doc.id }
      });

      return { ok: true as const };
    });

    if (!result.ok) return result;
    revalidatePath("/portal/kyc");
    revalidatePath("/portal/documents");
    return result;
  } catch (error) {
    console.error("[kyc:remove]", error);
    return { ok: false, error: KYC_DOCUMENT_CHANGE_ERROR };
  }
}

export async function submitKycForReview(): Promise<{ ok: true } | { ok: false; error: string }> {
  const investor = await ensureInvestor();
  try {
    requireCompletedOnboarding(investor);
  } catch {
    return { ok: false, error: "Complete onboarding before submitting documents." };
  }
  if (investor.accountStatus !== "active") {
    return { ok: false, error: "Your account is not active." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize investor submissions with staff decisions, then recheck the
      // live state instead of trusting the session snapshot above.
      const [lockedInvestor] = await tx
        .select({
          id: investors.id,
          accountType: investors.accountType,
          accountStatus: investors.accountStatus,
          kycStatus: investors.kycStatus,
          authUserId: investors.authUserId
        })
        .from(investors)
        .where(eq(investors.id, investor.id))
        .for("update");

      if (!lockedInvestor) {
        return { ok: false as const, error: "Investor not found." };
      }
      if (lockedInvestor.accountStatus !== "active") {
        return { ok: false as const, error: "Your account is not active." };
      }
      if (lockedInvestor.kycStatus === "approved") {
        return { ok: false as const, error: "Your documents are already approved." };
      }
      // Idempotent under the row lock: a concurrent repeat changes nothing and
      // cannot create a duplicate submission audit.
      if (lockedInvestor.kycStatus === "submitted") {
        return { ok: true as const };
      }
      if (lockedInvestor.kycStatus === "under_review") {
        return { ok: false as const, error: "Your documents are already under review." };
      }
      if (
        lockedInvestor.kycStatus !== "not_started" &&
        lockedInvestor.kycStatus !== "rejected"
      ) {
        return {
          ok: false as const,
          error: "Your documents cannot be submitted from the current status."
        };
      }

      // Shared locks keep the validated pack stable until the status and audit
      // commit. Retracted rows are absent for both gating and portal listings.
      const mine = await tx
        .select({ id: documents.id, category: documents.category })
        .from(documents)
        .where(
          and(
            eq(documents.ownerType, "investor"),
            eq(documents.ownerId, investor.id),
            isNull(documents.retractedAt)
          )
        )
        .for("share");
      const cats = new Set(mine.map((document) => document.category));

      const accountType = lockedInvestor.accountType ?? "individual";
      if (accountType === "company") {
        if (!cats.has("kyc_id") || !cats.has("kyc_company") || !cats.has("kyc_address")) {
          return {
            ok: false as const,
            error: KYC_COMPANY_REQUIREMENTS
          };
        }
      } else if (!cats.has("kyc_id") || !cats.has("kyc_address")) {
        return {
          ok: false as const,
          error: "Upload ID and address proof before submitting."
        };
      }

      await tx
        .update(investors)
        .set({ kycStatus: "submitted", kycRejectReason: null, updatedAt: new Date() })
        .where(eq(investors.id, investor.id));

      await tx.insert(auditEvents).values({
        actorUserId: lockedInvestor.authUserId ?? "unknown",
        action: "kyc.submitted",
        entityType: "investor",
        entityId: investor.id,
        payload: { files: mine.length }
      });

      return { ok: true as const };
    });

    if (!result.ok) return result;
  } catch (error) {
    console.error("[kyc:submit]", error);
    return { ok: false, error: KYC_SUBMIT_CONNECTION_ERROR };
  }

  revalidatePath("/portal/kyc");
  return { ok: true };
}

export async function setKycStatus(input: {
  investorId: string;
  status: "approved" | "rejected" | "under_review";
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  // Validate the rejection note after the locked authorization and state
  // checks below. An out-of-scope staff member should receive the same
  // authorization result regardless of the submitted note.
  let rejectReason: string | null = null;

  // Lock and authorize the current row in the same transaction as the
  // transition. Assignment, status, and the email recipient must all come
  // from the row that is actually being changed.
  const committed = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        assignedAgentId: investors.assignedAgentId,
        ibId: investors.ibId,
        email: investors.email,
        kycStatus: investors.kycStatus
      })
      .from(investors)
      .where(eq(investors.id, input.investorId))
      .for("update");

    if (!target) {
      return { ok: false as const, error: "Investor not found." };
    }
    if (
      !investorVisibleToStaff({
        role: admin.role,
        staffId: admin.staffId,
        investor: { assignedAgentId: target.assignedAgentId, ibId: target.ibId }
      })
    ) {
      return { ok: false as const, error: "Forbidden." };
    }

    if (!KYC_STATUS_TRANSITIONS[target.kycStatus]?.has(input.status)) {
      return {
        ok: false as const,
        error: `Cannot move KYC from ${target.kycStatus} to ${input.status}.`
      };
    }

    if (input.status === "rejected") {
      const parsed = validateOpsRejectNote(input.reason);
      if (!parsed.ok) {
        return {
          ok: false as const,
          error: parsed.error.replace("Rejection note", "Reject reason")
        };
      }
      rejectReason = parsed.note;
    }

    const updated = await tx
      .update(investors)
      .set({
        kycStatus: input.status,
        kycRejectReason: rejectReason,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(investors.id, input.investorId),
          eq(investors.kycStatus, target.kycStatus)
        )
      )
      .returning({ id: investors.id });

    if (updated.length !== 1) {
      return {
        ok: false as const,
        error: "KYC status changed while you were reviewing it. Refresh and try again."
      };
    }

    await tx.insert(auditEvents).values({
      actorUserId: admin.id,
      action: `kyc.${input.status}`,
      entityType: "investor",
      entityId: input.investorId,
      payload: { fromStatus: target.kycStatus, toStatus: input.status, reason: rejectReason }
    });

    return { ok: true as const, email: target.email };
  });

  if (!committed.ok) return committed;

  // Terminal decisions email the investor; a delivery failure must not roll
  // back the status change (matches the other admin-action email handlers).
  if (input.status === "approved" || input.status === "rejected") {
    try {
      const message = kycDecisionEmail({ status: input.status, reason: rejectReason });
      await sendTransactionalEmail({ to: committed.email, ...message });
    } catch (error) {
      console.error(`[email:kyc.${input.status}]`, error);
    }
  }

  revalidatePath(`/admin/investors/${input.investorId}`);
  revalidatePath("/admin/investors");
  revalidatePath("/portal/kyc");
  return { ok: true };
}

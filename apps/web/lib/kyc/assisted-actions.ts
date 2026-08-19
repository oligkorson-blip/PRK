"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/investor";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { auditEvents, db, documents, investors } from "@/lib/db";
import { buildObjectKey, deleteObject, isStorageConfigured, putObject } from "@/lib/storage/local";
import { sniffMatchesType } from "@/lib/storage/sniff";

// Mirrors the investor pipeline in ./actions. Duplicated (not exported there)
// because "use server" modules may only export async functions.
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_CATEGORIES = new Set(["kyc_id", "kyc_address", "kyc_company", "kyc_source_funds", "kyc_other"]);
const KYC_NOT_FOUND = "KYC_NOT_FOUND";
const KYC_UPLOAD_LOCKED = "KYC_UPLOAD_LOCKED";

/**
 * Staff upload on behalf of an investor. Same pipeline as uploadKycDocument
 * (MIME + magic-byte sniffing, 10 MB cap, category validation,
 * storage-write-then-DB-insert with cleanup, 10-file cap) but actor = staff
 * and no onboarding/account gate — assisted upload exists for investors who
 * have not completed onboarding themselves.
 */
export async function assistedKycUpload(
  investorId: string,
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }
  if (!isStorageConfigured()) {
    return { ok: false, error: "Document storage is not configured." };
  }

  const [target] = await db
    .select({
      assignedAgentId: investors.assignedAgentId,
      ibId: investors.ibId,
      kycStatus: investors.kycStatus
    })
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);
  // One "Not found" for missing and out-of-scope alike — no existence oracle.
  if (!target) return { ok: false, error: "Not found" };
  if (
    !investorVisibleToStaff({
      role: admin.role,
      staffId: admin.staffId,
      investor: { assignedAgentId: target.assignedAgentId, ibId: target.ibId }
    })
  ) {
    return { ok: false, error: "Not found" };
  }
  if (target.kycStatus !== "not_started" && target.kycStatus !== "rejected") {
    return { ok: false, error: "KYC documents are locked in the current status." };
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
  const title = String(formData.get("title") ?? "").trim().slice(0, 200) || file.name;

  // Retracted rows read as gone everywhere else — they must not hold a cap slot.
  const ownerFilter = and(
    eq(documents.ownerType, "investor"),
    eq(documents.ownerId, investorId),
    isNull(documents.retractedAt)
  );
  const existing = await db.select({ id: documents.id }).from(documents).where(ownerFilter);
  if (existing.length >= 10) {
    return { ok: false, error: "This investor already has 10 files." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = buildObjectKey({
    ownerType: "investor",
    ownerId: investorId,
    filename: file.name
  });
  try {
    await putObject(storageKey, buffer, file.type);
  } catch (err) {
    console.error("[storage:put]", err);
    return { ok: false, error: "Upload to storage failed." };
  }

  try {
    // Lock the investor row so concurrent uploads serialize on the cap check.
    const doc = await db.transaction(async (tx) => {
      const [lockedTarget] = await tx
        .select({
          assignedAgentId: investors.assignedAgentId,
          ibId: investors.ibId,
          kycStatus: investors.kycStatus
        })
        .from(investors)
        .where(eq(investors.id, investorId))
        .for("update");

      // The earlier scope check avoids unnecessary storage work. This locked
      // recheck is authoritative if the investor was reassigned meanwhile.
      if (
        !lockedTarget ||
        !investorVisibleToStaff({
          role: admin.role,
          staffId: admin.staffId,
          investor: {
            assignedAgentId: lockedTarget.assignedAgentId,
            ibId: lockedTarget.ibId
          }
        })
      ) {
        throw new Error(KYC_NOT_FOUND);
      }

      if (lockedTarget.kycStatus !== "not_started" && lockedTarget.kycStatus !== "rejected") {
        throw new Error(KYC_UPLOAD_LOCKED);
      }

      const count = await tx.select({ id: documents.id }).from(documents).where(ownerFilter);
      if (count.length >= 10) throw new Error("KYC_CAP_EXCEEDED");
      const [inserted] = await tx
        .insert(documents)
        .values({
          ownerType: "investor",
          ownerId: investorId,
          title,
          category,
          storageKey,
          contentType: file.type,
          uploadedBy: admin.id
        })
        .returning();
      await tx.insert(auditEvents).values({
        actorUserId: admin.id,
        action: "kyc.assisted_upload",
        entityType: "investor",
        entityId: investorId,
        payload: { documentId: inserted.id, category, contentType: file.type, staffId: admin.staffId }
      });
      return inserted;
    });

    revalidatePath(`/admin/investors/${investorId}`);
    revalidatePath("/portal/kyc");
    return { ok: true, id: doc.id };
  } catch (err) {
    await deleteObject(storageKey).catch((cleanupErr) => {
      console.error("[storage:cleanup]", cleanupErr);
    });
    if (err instanceof Error && err.message === KYC_NOT_FOUND) {
      return { ok: false, error: "Not found" };
    }
    if (err instanceof Error && err.message === KYC_UPLOAD_LOCKED) {
      return { ok: false, error: "KYC documents are locked in the current status." };
    }
    if (err instanceof Error && err.message === "KYC_CAP_EXCEEDED") {
      return { ok: false, error: "This investor already has 10 files." };
    }
    console.error("[kyc:assisted-upload]", err);
    return { ok: false, error: "Could not save the document." };
  }
}
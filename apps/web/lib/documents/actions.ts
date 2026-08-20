"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/investor";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { assets, auditEvents, db, documents, holdings, investors } from "@/lib/db";
import { staffCanAccessAdminDocument } from "@/lib/documents/access";
import { loadHoldingOwner } from "@/lib/documents/queries";
import { isUuid } from "@/lib/format";
import { buildObjectKey, deleteObject, isStorageConfigured, putObject } from "@/lib/storage/local";
import { sniffMatchesType } from "@/lib/storage/sniff";
import { ERROR_UPLOAD_STORAGE } from "@/lib/copy/errors";

const MAX_BYTES = 15 * 1024 * 1024;

export async function adminUploadDocument(formData: FormData): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHENTICATED") return { ok: false, error: "Unauthenticated." };
    return { ok: false, error: "Forbidden." };
  }
  const userId = admin.id;

  if (!isStorageConfigured()) {
    return { ok: false, error: "Document storage is not configured." };
  }

  const ownerType = String(formData.get("ownerType") ?? "");
  const ownerIdRaw = String(formData.get("ownerId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const file = formData.get("file");

  if (
    ownerType !== "asset" &&
    ownerType !== "holding" &&
    ownerType !== "investor" &&
    ownerType !== "platform"
  ) {
    return { ok: false, error: "Invalid owner type." };
  }
  // Platform and asset documents are visible to every investor, so only
  // super admins may publish them; agents/IBs may publish investor and
  // holding documents only within their permitted book.
  if (ownerType === "platform" || ownerType === "asset") {
    try {
      await requireSuperAdmin();
    } catch {
      return { ok: false, error: "Forbidden." };
    }
  }
  if (!title || !category) {
    return { ok: false, error: "Title and category are required." };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "PDF file is required." };
  }
  if (file.type !== "application/pdf") {
    return { ok: false, error: "Only PDF files are allowed." };
  }
  if (!(await sniffMatchesType(file, "application/pdf"))) {
    return { ok: false, error: "File content does not match its type." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File must be 15MB or smaller." };
  }

  const ownerId = ownerType === "platform" ? null : ownerIdRaw || null;
  if (ownerType !== "platform" && !ownerId) {
    return { ok: false, error: "Owner id is required for asset, holding, and investor documents." };
  }
  if (ownerId && !isUuid(ownerId)) {
    return { ok: false, error: "Owner id must be a valid UUID." };
  }

  if (ownerType === "asset" && ownerId) {
    let asset: { id: string } | undefined;
    try {
      [asset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, ownerId)).limit(1);
    } catch (err) {
      console.error("[documents:loadAsset]", err);
      return { ok: false, error: "Could not verify the asset." };
    }
    if (!asset) {
      return { ok: false, error: "Asset not found." };
    }
  }

  if (ownerType === "holding" && ownerId) {
    let holdingOwner: Awaited<ReturnType<typeof loadHoldingOwner>>;
    try {
      holdingOwner = await loadHoldingOwner(ownerId);
    } catch (err) {
      console.error("[documents:loadHoldingOwner]", err);
      return { ok: false, error: "Could not verify the holding." };
    }
    if (holdingOwner === undefined) {
      return { ok: false, error: "Holding not found." };
    }
    if (
      !staffCanAccessAdminDocument({
        role: admin.role,
        staffId: admin.staff.id,
        doc: { ownerType: "holding", ownerId },
        holdingOwner
      })
    ) {
      return { ok: false, error: "You do not have access to upload for this holding." };
    }
  }

  if (ownerType === "investor" && ownerId) {
    let investorOwner:
      | { assignedAgentId: string | null; ibId: string | null }
      | undefined;
    try {
      [investorOwner] = await db
        .select({
          assignedAgentId: investors.assignedAgentId,
          ibId: investors.ibId
        })
        .from(investors)
        .where(eq(investors.id, ownerId))
        .limit(1);
    } catch (err) {
      console.error("[documents:loadInvestorOwner]", err);
      return { ok: false, error: "Could not verify the investor." };
    }
    if (investorOwner === undefined) {
      return { ok: false, error: "Investor not found." };
    }
    if (
      !staffCanAccessAdminDocument({
        role: admin.role,
        staffId: admin.staff.id,
        doc: { ownerType: "investor", ownerId },
        investorOwner
      })
    ) {
      return { ok: false, error: "You do not have access to upload for this investor." };
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = buildObjectKey({
    ownerType,
    ownerId,
    filename: file.name || "document.pdf"
  });

  try {
    await putObject(storageKey, buffer, "application/pdf");
  } catch (err) {
    console.error("[storage:put]", err);
    return { ok: false, error: ERROR_UPLOAD_STORAGE };
  }

  let created: typeof documents.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      if (ownerType === "holding" && ownerId) {
        const [lockedHoldingOwner] = await tx
          .select({
            assignedAgentId: investors.assignedAgentId,
            ibId: investors.ibId
          })
          .from(holdings)
          .innerJoin(investors, eq(holdings.investorId, investors.id))
          .where(eq(holdings.id, ownerId))
          .limit(1)
          .for("update");

        if (
          !lockedHoldingOwner ||
          !staffCanAccessAdminDocument({
            role: admin.role,
            staffId: admin.staff.id,
            doc: { ownerType: "holding", ownerId },
            holdingOwner: lockedHoldingOwner
          })
        ) {
          throw new Error("DOCUMENT_SCOPE_CHANGED");
        }
      }

      if (ownerType === "investor" && ownerId) {
        const [lockedInvestorOwner] = await tx
          .select({
            assignedAgentId: investors.assignedAgentId,
            ibId: investors.ibId
          })
          .from(investors)
          .where(eq(investors.id, ownerId))
          .limit(1)
          .for("update");

        if (
          !lockedInvestorOwner ||
          !staffCanAccessAdminDocument({
            role: admin.role,
            staffId: admin.staff.id,
            doc: { ownerType: "investor", ownerId },
            investorOwner: lockedInvestorOwner
          })
        ) {
          throw new Error("DOCUMENT_SCOPE_CHANGED");
        }
      }

      const [document] = await tx
        .insert(documents)
        .values({
          ownerType,
          ownerId,
          title,
          category,
          storageKey,
          contentType: "application/pdf",
          uploadedBy: userId
        })
        .returning();
      if (!document) {
        throw new Error("Document insert returned no row.");
      }

      // The published row and its compliance event are one database commit.
      // Any audit failure rolls the row back before storage cleanup begins.
      await tx.insert(auditEvents).values({
        actorUserId: userId,
        action: "document.uploaded",
        entityType: "document",
        entityId: document.id,
        payload: { ownerType, ownerId, title, category }
      });

      return document;
    });
  } catch (err) {
    await deleteObject(storageKey).catch((cleanupErr) => {
      console.error("[storage:cleanup]", cleanupErr);
    });
    if (err instanceof Error && err.message === "DOCUMENT_SCOPE_CHANGED") {
      return {
        ok: false,
        error: "You no longer have access to upload for this record. Refresh and try again."
      };
    }
    console.error("[documents:transaction]", err);
    return { ok: false, error: "Could not save the document." };
  }

  revalidatePath("/admin/documents");
  revalidatePath("/portal/documents");
  return { ok: true, id: created.id };
}

/**
 * Soft-delete a published document. The storage object stays on disk — only
 * the row is marked. Investors immediately lose listing + download access
 * (404-no-oracle); staff keep download access for audit. Super admins only,
 * because retraction is a compliance action, not a per-book operation.
 */
export async function retractDocument(input: {
  documentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let admin: Awaited<ReturnType<typeof requireSuperAdmin>>;
  try {
    admin = await requireSuperAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHENTICATED") return { ok: false, error: "Unauthenticated." };
    return { ok: false, error: "Forbidden." };
  }

  if (!isUuid(input.documentId)) {
    return { ok: false, error: "Document not found." };
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, input.documentId))
    .limit(1);
  if (!doc) {
    return { ok: false, error: "Document not found." };
  }
  // Idempotent: a repeat retract changes nothing and writes no second audit.
  if (doc.retractedAt) {
    return { ok: true };
  }

  const retracted = await db.transaction(async (tx) => {
    // The null guard makes concurrent retractions idempotent. Only the caller
    // that changes the document state writes the matching compliance audit.
    const updated = await tx
      .update(documents)
      .set({ retractedAt: new Date() })
      .where(and(eq(documents.id, doc.id), isNull(documents.retractedAt)))
      .returning({ id: documents.id });

    if (updated.length === 0) {
      return false;
    }

    await tx.insert(auditEvents).values({
      actorUserId: admin.user.id,
      action: "document.retracted",
      entityType: "document",
      entityId: doc.id,
      payload: { ownerType: doc.ownerType, ownerId: doc.ownerId, title: doc.title }
    });

    return true;
  });

  // A concurrent request may have committed after the read above. Treat that
  // as the same idempotent success without writing a duplicate audit event.
  if (!retracted) {
    return { ok: true };
  }

  revalidatePath("/admin/documents");
  revalidatePath("/portal/documents");
  revalidatePath("/portal/kyc");
  return { ok: true };
}

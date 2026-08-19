import { and, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ensureInvestor, requireAdmin } from "@/lib/auth/investor";
import { isOnboardingComplete } from "@/lib/auth/gates";
import type { StaffRole } from "@/lib/auth/roles";
import { requireSessionUser } from "@/lib/auth/session";
import {
  assets,
  auditEvents,
  db,
  documents,
  holdings,
  interests,
  investors,
  staffProfiles
} from "@/lib/db";
import { canAccessDocument, staffCanAccessAdminDocument } from "@/lib/documents/access";
import { isUuid } from "@/lib/format";
import { findInvestorByAuthUserId } from "@/lib/investors/queries";

/**
 * Read-side data access for the documents vault. Plain module (no
 * "use server"): runs inside server pages and the download route only;
 * the upload mutation stays in lib/documents/actions.ts. Authz gates
 * (ensureInvestor/requireAdmin/requireSessionUser + scope checks) are
 * enforced here exactly as they were in the action module.
 */

export type DocumentRow = typeof documents.$inferSelect;

/** Internal helper — never call with a client-supplied investorId. */
async function loadInvestorDocumentAccessSets(investorId: string) {
  // Only live interests grant asset-doc access: declined/withdrawn must not
  // keep the deal pack visible. Pending is kept on purpose — the investor
  // reads the pack before deciding. Holdings stay unfiltered: closed
  // holdings keep their historical documents.
  const interestRows = await db
    .select({ assetId: interests.assetId })
    .from(interests)
    .where(
      and(
        eq(interests.investorId, investorId),
        inArray(interests.status, ["pending", "confirmed"])
      )
    );
  const holdingRows = await db
    .select({ id: holdings.id, assetId: holdings.assetId })
    .from(holdings)
    .where(eq(holdings.investorId, investorId));

  const relatedAssetIds = new Set<string>([
    ...interestRows.map((r) => r.assetId),
    ...holdingRows.map((r) => r.assetId)
  ]);
  const ownedHoldingIds = new Set(holdingRows.map((r) => r.id));
  return { relatedAssetIds, ownedHoldingIds };
}

/** Session-scoped access sets for the authenticated investor only. */
export async function getInvestorDocumentAccessSets() {
  const investor = await ensureInvestor();
  return loadInvestorDocumentAccessSets(investor.id);
}

/**
 * SQL mirror of canAccessDocument for the investor's own vault listing:
 * platform docs for everyone, investor docs keyed to themselves, asset docs
 * keyed to related assets, holding docs keyed to owned holdings.
 */
function investorDocumentScope(input: {
  investorId: string;
  relatedAssetIds: Set<string>;
  ownedHoldingIds: Set<string>;
}): SQL {
  const conditions: SQL[] = [
    eq(documents.ownerType, "platform"),
    and(eq(documents.ownerType, "investor"), eq(documents.ownerId, input.investorId))!
  ];
  if (input.relatedAssetIds.size > 0) {
    conditions.push(
      and(
        eq(documents.ownerType, "asset"),
        inArray(documents.ownerId, [...input.relatedAssetIds])
      )!
    );
  }
  if (input.ownedHoldingIds.size > 0) {
    conditions.push(
      and(
        eq(documents.ownerType, "holding"),
        inArray(documents.ownerId, [...input.ownedHoldingIds])
      )!
    );
  }
  return or(...conditions)!;
}

/** Lists vault docs for the authenticated session investor (no client investorId). */
export async function listDocumentsForInvestor() {
  const investor = await ensureInvestor();
  const { relatedAssetIds, ownedHoldingIds } = await loadInvestorDocumentAccessSets(investor.id);
  return db
    .select()
    .from(documents)
    .where(
      and(
        // Retracted documents are hidden from investors entirely.
        isNull(documents.retractedAt),
        investorDocumentScope({ investorId: investor.id, relatedAssetIds, ownedHoldingIds })
      )
    );
}

export async function loadHoldingOwner(holdingId: string): Promise<
  { assignedAgentId: string | null; ibId: string | null } | undefined
> {
  const [row] = await db
    .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
    .from(holdings)
    .innerJoin(investors, eq(holdings.investorId, investors.id))
    .where(eq(holdings.id, holdingId))
    .limit(1);
  return row;
}

export async function assertInvestorCanDownload(documentId: string) {
  // Read-only: a GET download must never provision an investor record.
  const user = await requireSessionUser();
  if (!isUuid(documentId)) throw new Error("NOT_FOUND");
  const investor = await findInvestorByAuthUserId(user.id);
  if (!investor) throw new Error("FORBIDDEN");
  if (!isOnboardingComplete(investor) || investor.accountStatus !== "active") {
    throw new Error("FORBIDDEN");
  }
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  // Retracted reads as not-found for investors — same 404-no-oracle semantics
  // as missing docs, so a retraction never confirms the document existed.
  if (!doc || doc.retractedAt) throw new Error("NOT_FOUND");

  const access = await loadInvestorDocumentAccessSets(investor.id);
  const allowed = canAccessDocument({
    doc: { ownerType: doc.ownerType, ownerId: doc.ownerId },
    investorId: investor.id,
    relatedAssetIds: access.relatedAssetIds,
    ownedHoldingIds: access.ownedHoldingIds
  });
  if (!allowed) throw new Error("FORBIDDEN");
  return { investor, doc };
}

/**
 * Staff download gate — agents cannot fetch other books' holding docs by id.
 * Retracted documents remain downloadable for staff on purpose: ops keeps
 * audit access to the exact bytes that were published (the file is still in
 * storage). Investors get a 404 — see assertInvestorCanDownload.
 */
export async function assertStaffCanDownload(documentId: string) {
  const admin = await requireAdmin();
  if (!isUuid(documentId)) throw new Error("NOT_FOUND");
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) throw new Error("NOT_FOUND");

  let holdingOwner: { assignedAgentId: string | null; ibId: string | null } | undefined;
  let investorOwner: { assignedAgentId: string | null; ibId: string | null } | undefined;
  if (doc.ownerType === "holding" && doc.ownerId) {
    holdingOwner = await loadHoldingOwner(doc.ownerId);
    if (holdingOwner === undefined) throw new Error("NOT_FOUND");
  }
  if (doc.ownerType === "investor" && doc.ownerId) {
    const [inv] = await db
      .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
      .from(investors)
      .where(eq(investors.id, doc.ownerId))
      .limit(1);
    if (!inv) throw new Error("NOT_FOUND");
    investorOwner = inv;
  }

  const allowed = staffCanAccessAdminDocument({
    role: admin.role,
    staffId: admin.staff.id,
    doc: { ownerType: doc.ownerType, ownerId: doc.ownerId },
    holdingOwner,
    investorOwner
  });
  if (!allowed) throw new Error("FORBIDDEN");
  return { admin, doc };
}

/** Investor-owned documents listed on the portal identity-checks page. */
export async function listInvestorOwnedDocuments(investorId: string) {
  return db
    .select({ id: documents.id, title: documents.title, category: documents.category })
    .from(documents)
    .where(
      and(
        eq(documents.ownerType, "investor"),
        eq(documents.ownerId, investorId),
        isNull(documents.retractedAt)
      )
    );
}

/**
 * Admin vault listing with the staff visibility filter applied. The caller
 * passes the already-authorized staff role/id (requireStaff stays in the
 * page); staffCanAccessAdminDocument decides row visibility.
 *
 * Rows are enriched for display: ownerName resolves the raw owner reference
 * (asset name for asset docs, investor email for investor/holding docs,
 * null for platform) and uploaderEmail joins the staff profile behind
 * documents.uploadedBy (auth user id). Null when unresolvable — the page
 * falls back to the owner-type label map.
 */
export type AdminDocumentRow = DocumentRow & {
  ownerName: string | null;
  uploaderEmail: string | null;
};

export async function listDocumentsForAdmin(scope: {
  role: StaffRole;
  staffId: string;
}): Promise<AdminDocumentRow[]> {
  // Apply the book boundary in SQL before loading document rows. Platform and
  // asset documents are staff-wide; investor and holding documents follow the
  // owning investor through explicit aliases.
  const documentInvestorOwner = alias(investors, "document_investor_owner");
  const documentHoldingOwner = alias(holdings, "document_holding_owner");
  const documentHoldingInvestorOwner = alias(
    investors,
    "document_holding_investor_owner"
  );

  const investorBookScope =
    scope.role === "ib"
      ? eq(documentInvestorOwner.ibId, scope.staffId)
      : eq(documentInvestorOwner.assignedAgentId, scope.staffId);
  const holdingBookScope =
    scope.role === "ib"
      ? eq(documentHoldingInvestorOwner.ibId, scope.staffId)
      : eq(documentHoldingInvestorOwner.assignedAgentId, scope.staffId);
  const documentScope =
    scope.role === "super_admin"
      ? undefined
      : or(
          inArray(documents.ownerType, ["platform", "asset"]),
          and(
            eq(documents.ownerType, "investor"),
            investorBookScope
          )!,
          and(
            eq(documents.ownerType, "holding"),
            holdingBookScope
          )!
        );

  const documentQuery = db
    .select({ doc: documents, uploaderEmail: staffProfiles.email })
    .from(documents)
    .leftJoin(staffProfiles, eq(documents.uploadedBy, staffProfiles.authUserId))
    .leftJoin(
      documentInvestorOwner,
      and(
        eq(documents.ownerType, "investor"),
        eq(documents.ownerId, documentInvestorOwner.id)
      )!
    )
    .leftJoin(
      documentHoldingOwner,
      and(
        eq(documents.ownerType, "holding"),
        eq(documents.ownerId, documentHoldingOwner.id)
      )!
    )
    .leftJoin(
      documentHoldingInvestorOwner,
      eq(documentHoldingOwner.investorId, documentHoldingInvestorOwner.id)
    );

  // Super admins need the unscoped query; scoped staff get the book predicate
  // before ordering and materialization.
  const allDocs = documentScope
    ? await documentQuery.where(documentScope).orderBy(desc(documents.createdAt))
    : await documentQuery.orderBy(desc(documents.createdAt));

  const holdingIds = [
    ...new Set(
      allDocs.filter((d) => d.doc.ownerType === "holding" && d.doc.ownerId).map((d) => d.doc.ownerId!)
    )
  ];

  const holdingMetaById = new Map<
    string,
    { assignedAgentId: string | null; ibId: string | null; investorEmail: string }
  >();
  if (holdingIds.length > 0) {
    const rows = await db
      .select({
        holdingId: holdings.id,
        assignedAgentId: investors.assignedAgentId,
        ibId: investors.ibId,
        investorEmail: investors.email
      })
      .from(holdings)
      .innerJoin(investors, eq(holdings.investorId, investors.id))
      .where(inArray(holdings.id, holdingIds));
    for (const row of rows) {
      holdingMetaById.set(row.holdingId, {
        assignedAgentId: row.assignedAgentId,
        ibId: row.ibId,
        investorEmail: row.investorEmail
      });
    }
  }

  // Investor-owner meta feeds both the visibility filter (investorOwner, like
  // assertStaffCanDownload) and the ownerName enrichment below.
  const investorOwnerIds = [
    ...new Set(
      allDocs.filter((d) => d.doc.ownerType === "investor" && d.doc.ownerId).map((d) => d.doc.ownerId!)
    )
  ];
  const investorMetaById = new Map<
    string,
    { assignedAgentId: string | null; ibId: string | null; email: string }
  >();
  if (investorOwnerIds.length > 0) {
    const rows = await db
      .select({
        id: investors.id,
        assignedAgentId: investors.assignedAgentId,
        ibId: investors.ibId,
        email: investors.email
      })
      .from(investors)
      .where(inArray(investors.id, investorOwnerIds));
    for (const row of rows) {
      investorMetaById.set(row.id, {
        assignedAgentId: row.assignedAgentId,
        ibId: row.ibId,
        email: row.email
      });
    }
  }

  const visible = allDocs.filter((d) =>
    staffCanAccessAdminDocument({
      role: scope.role,
      staffId: scope.staffId,
      doc: { ownerType: d.doc.ownerType, ownerId: d.doc.ownerId },
      holdingOwner:
        d.doc.ownerType === "holding" && d.doc.ownerId
          ? holdingMetaById.get(d.doc.ownerId)
          : undefined,
      investorOwner:
        d.doc.ownerType === "investor" && d.doc.ownerId
          ? investorMetaById.get(d.doc.ownerId)
          : undefined
    })
  );

  const assetIds = [
    ...new Set(
      visible.filter((d) => d.doc.ownerType === "asset" && d.doc.ownerId).map((d) => d.doc.ownerId!)
    )
  ];
  const assetNameById = new Map<string, string>();
  if (assetIds.length > 0) {
    const rows = await db
      .select({ id: assets.id, name: assets.name })
      .from(assets)
      .where(inArray(assets.id, assetIds));
    for (const row of rows) {
      assetNameById.set(row.id, row.name);
    }
  }

  return visible.map(({ doc, uploaderEmail }) => ({
    ...doc,
    uploaderEmail,
    ownerName:
      doc.ownerType === "asset" && doc.ownerId
        ? (assetNameById.get(doc.ownerId) ?? null)
        : doc.ownerType === "investor" && doc.ownerId
          ? (investorMetaById.get(doc.ownerId)?.email ?? null)
          : doc.ownerType === "holding" && doc.ownerId
            ? (holdingMetaById.get(doc.ownerId)?.investorEmail ?? null)
            : null
  }));
}

/** Audit write for a completed download; used by the download route only. */
export async function recordDocumentDownload(input: {
  actorUserId: string;
  documentId: string;
}): Promise<void> {
  await db.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    action: "document.downloaded",
    entityType: "document",
    entityId: input.documentId,
    payload: {}
  });
}

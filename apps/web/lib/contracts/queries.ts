import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { ensureInvestor } from "@/lib/auth/investor";
import {
  contractSigners,
  contractTransitions,
  contracts,
  db,
  documents
} from "@/lib/db";
import { canAccessDocument } from "@/lib/documents/access";
import { getInvestorDocumentAccessSets } from "@/lib/documents/queries";
import { isUuid } from "@/lib/format";

type JoinedContractRow = {
  contract: typeof contracts.$inferSelect;
  signedDocumentId: string | null;
  signedDocumentTitle: string | null;
  signedDocumentCreatedAt: Date | null;
};

type ContractReviewDocument = Pick<
  typeof documents.$inferSelect,
  "id" | "title" | "category" | "createdAt" | "ownerType" | "ownerId"
>;

function signedDocumentFromRow(row: {
  signedDocumentId: string | null;
  signedDocumentTitle: string | null;
  signedDocumentCreatedAt: Date | null;
}) {
  return row.signedDocumentId
    ? {
        id: row.signedDocumentId,
        title: row.signedDocumentTitle ?? "Signed agreement",
        createdAt: row.signedDocumentCreatedAt
      }
    : null;
}

async function loadContractReviewDocuments(
  contract: typeof contracts.$inferSelect,
  investorId: string
) {
  const documentIds = [
    contract.summaryDocumentId,
    contract.agreementDocumentId
  ].filter((id): id is string => Boolean(id));

  if (documentIds.length === 0) {
    return { summary: null, agreement: null };
  }

  const [rows, access] = await Promise.all([
    db
      .select({
        id: documents.id,
        title: documents.title,
        category: documents.category,
        createdAt: documents.createdAt,
        ownerType: documents.ownerType,
        ownerId: documents.ownerId
      })
      .from(documents)
      .where(and(inArray(documents.id, documentIds), isNull(documents.retractedAt))),
    getInvestorDocumentAccessSets()
  ]);

  const byId = new Map<string, ContractReviewDocument>();
  for (const row of rows) {
    byId.set(row.id, row);
  }

  function visibleDocument(documentId: string | null, fallbackTitle: string) {
    if (!documentId) return null;
    const document = byId.get(documentId);
    if (!document) return null;

    const allowed = canAccessDocument({
      doc: { ownerType: document.ownerType, ownerId: document.ownerId },
      investorId,
      relatedAssetIds: access.relatedAssetIds,
      ownedHoldingIds: access.ownedHoldingIds
    });
    if (!allowed) return null;

    return {
      id: document.id,
      title: document.title || fallbackTitle,
      category: document.category,
      createdAt: document.createdAt
    };
  }

  return {
    summary: visibleDocument(contract.summaryDocumentId, "Agreement summary"),
    agreement: visibleDocument(contract.agreementDocumentId, "Full agreement")
  };
}

/** Lists only contracts owned by the authenticated investor. */
export async function listContractsForInvestor() {
  const investor = await ensureInvestor();
  const rows = await db
    .select({
      contract: contracts,
      signedDocumentId: documents.id,
      signedDocumentTitle: documents.title,
      signedDocumentCreatedAt: documents.createdAt
    })
    .from(contracts)
    .leftJoin(
      documents,
      and(
        eq(contracts.signedDocumentId, documents.id),
        eq(documents.ownerType, "investor"),
        eq(documents.ownerId, investor.id),
        eq(documents.category, "contract_signed_agreement"),
        eq(documents.contentType, "application/pdf"),
        isNull(documents.retractedAt)
      )
    )
    .where(eq(contracts.investorId, investor.id))
    .orderBy(desc(contracts.updatedAt));

  return rows.map((row: JoinedContractRow) => ({
    ...row.contract,
    signedDocument: signedDocumentFromRow(row)
  }));
}

/** Loads one investor-owned contract with its review documents and history. */
export async function getContractForInvestor(contractId: string) {
  if (!isUuid(contractId)) return null;

  const investor = await ensureInvestor();
  const [row] = (await db
    .select({
      contract: contracts,
      signedDocumentId: documents.id,
      signedDocumentTitle: documents.title,
      signedDocumentCreatedAt: documents.createdAt
    })
    .from(contracts)
    .leftJoin(
      documents,
      and(
        eq(contracts.signedDocumentId, documents.id),
        eq(documents.ownerType, "investor"),
        eq(documents.ownerId, investor.id),
        eq(documents.category, "contract_signed_agreement"),
        eq(documents.contentType, "application/pdf"),
        isNull(documents.retractedAt)
      )
    )
    .where(and(eq(contracts.id, contractId), eq(contracts.investorId, investor.id)))
    .limit(1)) as JoinedContractRow[];

  if (!row) return null;

  const [reviewDocuments, signers, transitions] = await Promise.all([
    loadContractReviewDocuments(row.contract, investor.id),
    db
      .select()
      .from(contractSigners)
      .where(eq(contractSigners.contractId, contractId))
      .orderBy(asc(contractSigners.role)),
    db
      .select()
      .from(contractTransitions)
      .where(eq(contractTransitions.contractId, contractId))
      .orderBy(asc(contractTransitions.occurredAt))
  ]);

  return {
    ...row.contract,
    reviewDocuments,
    signedDocument: signedDocumentFromRow(row),
    signers,
    transitions
  };
}

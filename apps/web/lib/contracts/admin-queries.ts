import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  contractSignatureEvents,
  contractSigners,
  contractTransitions,
  contracts,
  db,
  documents,
  investors
} from "@/lib/db";
import { isUuid } from "@/lib/format";

/** Super-admin contract queue; authorization stays at the page/action boundary. */
export async function listContractsForAdmin() {
  return db
    .select({
      id: contracts.id,
      version: contracts.version,
      state: contracts.state,
      investorId: contracts.investorId,
      investorEmail: investors.email,
      investorName: investors.fullName,
      signedDocumentId: contracts.signedDocumentId,
      signedDocumentTitle: documents.title,
      updatedAt: contracts.updatedAt
    })
    .from(contracts)
    .innerJoin(investors, eq(contracts.investorId, investors.id))
    .leftJoin(
      documents,
      and(
        eq(contracts.signedDocumentId, documents.id),
        eq(documents.ownerType, "investor"),
        eq(documents.ownerId, contracts.investorId),
        eq(documents.category, "contract_signed_agreement"),
        eq(documents.contentType, "application/pdf"),
        isNull(documents.retractedAt)
      )
    )
    .orderBy(desc(contracts.updatedAt));
}

/**
 * Loads a complete staff-facing agreement record. The page that calls this
 * query is responsible for super-admin authorization so the data boundary is
 * reusable by future staff-only views without an investor session dependency.
 */
export async function getContractForAdmin(contractId: string) {
  if (!isUuid(contractId)) return null;

  const [contract] = await db
    .select({
      id: contracts.id,
      version: contracts.version,
      state: contracts.state,
      createdAt: contracts.createdAt,
      updatedAt: contracts.updatedAt,
      investorId: contracts.investorId,
      investorEmail: investors.email,
      investorName: investors.fullName,
      signedDocumentId: contracts.signedDocumentId,
      signedDocumentTitle: documents.title
    })
    .from(contracts)
    .innerJoin(investors, eq(contracts.investorId, investors.id))
    .leftJoin(
      documents,
      and(
        eq(contracts.signedDocumentId, documents.id),
        eq(documents.ownerType, "investor"),
        eq(documents.ownerId, contracts.investorId),
        eq(documents.category, "contract_signed_agreement"),
        eq(documents.contentType, "application/pdf"),
        isNull(documents.retractedAt)
      )
    )
    .where(eq(contracts.id, contractId))
    .limit(1);

  if (!contract) return null;

  const [signers, transitions, signatureEvents] = await Promise.all([
    db
      .select()
      .from(contractSigners)
      .where(eq(contractSigners.contractId, contractId))
      .orderBy(asc(contractSigners.role)),
    db
      .select()
      .from(contractTransitions)
      .where(eq(contractTransitions.contractId, contractId))
      .orderBy(asc(contractTransitions.occurredAt)),
    db
      .select()
      .from(contractSignatureEvents)
      .where(eq(contractSignatureEvents.contractId, contractId))
      .orderBy(
        asc(contractSignatureEvents.occurredAt),
        asc(contractSignatureEvents.receivedAt)
      )
  ]);

  return { ...contract, signers, transitions, signatureEvents };
}

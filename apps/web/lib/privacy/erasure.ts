import { and, eq } from "drizzle-orm";
import { auditEvents, db, documents, investorApplications, investors, leads, session, user } from "@/lib/db";
import { deleteObject } from "@/lib/storage/local";

/**
 * GDPR erasure workflow (admin investor detail → Erasure section).
 *
 * Anonymises PII on the investor row (including the CDD fields collected at
 * onboarding), the linked Better Auth user row, the linked lead, and the
 * investor's investor_applications rows; kills the user's live sessions; and
 * deletes the investor's KYC document rows and vault files. Financial ledger
 * rows (holdings/distributions) are legal records and are never touched;
 * consent timestamps, attribution ids, and the authUserId link stay so ledger
 * FKs and history remain intact. With `legalHold`, KYC deletion is skipped —
 * the caller records the reason in the audit event. The hold covers KYC
 * retention only: application rows are not KYC documents, so they are
 * anonymised either way.
 */

export const ERASED_EMAIL_DOMAIN = "erased.parkwise.invalid";

/** Unique per investor, so the lower(email) unique index still holds. */
export function anonymizedInvestorEmail(investorId: string): string {
  return `erased+${investorId}@${ERASED_EMAIL_DOMAIN}`;
}

/** Unique per lead, so the (list, lower(email)) unique index still holds. */
export function anonymizedLeadEmail(leadId: string): string {
  return `erased+${leadId}@${ERASED_EMAIL_DOMAIN}`;
}

export function isErasedInvestorEmail(email: string, investorId: string): boolean {
  return email.toLowerCase() === anonymizedInvestorEmail(investorId).toLowerCase();
}

/**
 * Thrown when the investor row lock reveals a committed earlier erasure — a
 * concurrent double-submit lost the race. The action maps this back to the
 * already-erased error instead of writing a duplicate audit event.
 */
export class AlreadyErasedError extends Error {
  constructor() {
    super("Investor has already been erased.");
    this.name = "AlreadyErasedError";
  }
}

export type ErasureOutcome = {
  leadsAnonymized: number;
  applicationsAnonymized: number;
  kycDocumentsDeleted: number;
  kycFilesDeleted: number;
};

export async function eraseInvestorPii(input: {
  investorId: string;
  legalHold: boolean;
  actorUserId: string;
  legalHoldReason: string | null;
}): Promise<ErasureOutcome> {
  // The authUserId link is needed to anonymise the linked Better Auth user.
  const [investorRow] = await db
    .select({ authUserId: investors.authUserId })
    .from(investors)
    .where(eq(investors.id, input.investorId))
    .limit(1);

  // leads.investorId is unique — at most one linked lead.
  const linkedLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.investorId, input.investorId));

  // investor_applications rows still carry the submitted PII (name, email,
  // phone, country, free-text investment profile). They are not KYC
  // documents, so a legal hold — which covers KYC retention only — does not
  // exempt them: anonymise them in all cases. Email takes the same
  // per-investor erased alias as the investor row so applications stay
  // linkable to it (this table has no unique index on email, so rows may
  // share the alias). Consent timestamps, account type, status, the ops
  // note, and the leadId attribution link stay, consistent with the investor
  // row above; the financial ledger lives in holdings/distributions and
  // never reads these fields.
  const linkedApplications = await db
    .select({ id: investorApplications.id })
    .from(investorApplications)
    .where(eq(investorApplications.investorId, input.investorId));

  const kycDocs = input.legalHold
    ? []
    : await db
        .select({ id: documents.id, storageKey: documents.storageKey })
        .from(documents)
        .where(and(eq(documents.ownerType, "investor"), eq(documents.ownerId, input.investorId)));

  // All row writes run in a single transaction: a mid-flow failure rolls the
  // whole erasure back instead of leaving a half-anonymised record whose
  // retry would be blocked by the already-erased email guard. Vault files
  // stay outside — storage is not transactional, and rows-first/files-last
  // ordering (below) means a failed unlink never leaves rows pointing at
  // files that are already gone.
  await db.transaction(async (tx) => {
    // Lock the investor row and re-check the already-erased email under the
    // lock: a concurrent erasure double-submit blocks here until the winner
    // commits, then throws instead of anonymising (and auditing) twice.
    const [locked] = await tx
      .select({ email: investors.email })
      .from(investors)
      .where(eq(investors.id, input.investorId))
      .for("update");
    if (locked && isErasedInvestorEmail(locked.email, input.investorId)) {
      throw new AlreadyErasedError();
    }

    await tx
      .update(investors)
      .set({
        email: anonymizedInvestorEmail(input.investorId),
        fullName: "",
        country: "",
        phone: null,
        kycRejectReason: null,
        // CDD fields collected at onboarding — same null convention as the
        // investor_applications anonymisation below.
        dateOfBirth: null,
        address: null,
        nationality: null,
        companyLegalName: null,
        countryOfIncorporation: null,
        companyNumber: null,
        eligibilityAnswers: {},
        updatedAt: new Date()
      })
      .where(eq(investors.id, input.investorId));

    // The linked Better Auth user holds the same name/email and can sign in.
    // Anonymise it with the same per-investor erased alias (unique, so
    // user.email's unique constraint still holds) and kill every live
    // session. The user row itself stays: investors.authUserId and the export
    // join keep pointing at it.
    if (investorRow?.authUserId) {
      await tx
        .update(user)
        .set({
          name: "",
          email: anonymizedInvestorEmail(input.investorId),
          updatedAt: new Date()
        })
        .where(eq(user.id, investorRow.authUserId));
      await tx.delete(session).where(eq(session.userId, investorRow.authUserId));
    }

    for (const lead of linkedLeads) {
      await tx
        .update(leads)
        .set({
          fullName: "Erased",
          email: anonymizedLeadEmail(lead.id),
          phone: null,
          notes: null,
          sourceDetail: null,
          updatedAt: new Date()
        })
        .where(eq(leads.id, lead.id));
    }

    for (const application of linkedApplications) {
      await tx
        .update(investorApplications)
        .set({
          firstName: "",
          lastName: "",
          email: anonymizedInvestorEmail(input.investorId),
          phone: "",
          countryOfResidence: "",
          companyLegalName: null,
          countryOfIncorporation: null,
          investmentProfile: {},
          updatedAt: new Date()
        })
        .where(eq(investorApplications.id, application.id));
    }

    if (kycDocs.length > 0) {
      await tx
        .delete(documents)
        .where(and(eq(documents.ownerType, "investor"), eq(documents.ownerId, input.investorId)));
    }

    // The compliance record is part of the same commit as the destructive
    // row changes. If this insert fails, the transaction rolls back and the
    // investor remains retryable instead of becoming permanently unaudited.
    // Vault deletion happens after commit, so the event records the number of
    // files scheduled for cleanup rather than claiming that cleanup completed.
    await tx.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      action: "investor.erased",
      entityType: "investor",
      entityId: input.investorId,
      payload: {
        erasedEmail: anonymizedInvestorEmail(input.investorId),
        legalHold: input.legalHold,
        legalHoldReason: input.legalHold ? input.legalHoldReason : null,
        leadsAnonymized: linkedLeads.length,
        applicationsAnonymized: linkedApplications.length,
        kycDocumentsDeleted: kycDocs.length,
        kycFilesDeletionRequested: kycDocs.length
      }
    });
  });

  // Files last (seed-assets ordering), after the row delete has committed.
  // File errors are logged, never fatal — the rows are already correct.
  let kycFilesDeleted = 0;
  for (const doc of kycDocs) {
    try {
      await deleteObject(doc.storageKey);
      kycFilesDeleted += 1;
    } catch (err) {
      console.warn(`privacy: could not delete vault file ${doc.storageKey}:`, err);
    }
  }

  return {
    leadsAnonymized: linkedLeads.length,
    applicationsAnonymized: linkedApplications.length,
    kycDocumentsDeleted: kycDocs.length,
    kycFilesDeleted
  };
}

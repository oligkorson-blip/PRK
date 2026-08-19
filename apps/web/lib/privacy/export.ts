import { and, desc, eq } from "drizzle-orm";
import {
  assets,
  db,
  distributions,
  documents,
  holdings,
  interests,
  investorApplications,
  investors,
  kycChecks,
  leads,
  user,
  userAccessEvents
} from "@/lib/db";

/**
 * Self-serve GDPR data export (portal settings → "Download my data").
 *
 * Everything in the returned document is JSON-safe: dates are ISO strings and
 * KYC files themselves are never included — only their metadata. Internal
 * bookkeeping (staff attribution ids, ops notes, storage keys, raw enrichment
 * payloads) stays out; the document is the data we hold *about the person*.
 */
export type InvestorDataExport = {
  generatedAt: string;
  investor: {
    id: string;
    authUserId: string | null;
    email: string;
    fullName: string;
    country: string;
    phone: string | null;
    accountType: "individual" | "company" | null;
    onboardingStatus: string;
    accountStatus: string;
    kycStatus: string;
    kycRejectReason: string | null;
    eligibilityAnswers: Record<string, unknown>;
    termsAcceptedAt: string | null;
    riskAcceptedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  authUser: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
  /** The linked CRM lead (leads.investorId is unique — at most one). */
  lead: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  applications: {
    id: string;
    accountType: "individual" | "company";
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    countryOfResidence: string;
    companyLegalName: string | null;
    countryOfIncorporation: string | null;
    investmentProfile: Record<string, unknown>;
    termsAcceptedAt: string;
    riskAcceptedAt: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }[];
  interests: {
    id: string;
    assetSlug: string | null;
    assetName: string | null;
    amountEur: number;
    optionId: string | null;
    note: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  }[];
  holdings: {
    id: string;
    assetSlug: string | null;
    assetName: string | null;
    amountEur: number;
    targetYieldPct: string;
    status: string;
    confirmedAt: string;
    createdAt: string;
  }[];
  distributions: {
    id: string;
    holdingId: string;
    amountEur: number;
    type: "income" | "return_of_capital" | "other";
    status: string;
    periodLabel: string | null;
    paidAt: string | null;
    note: string | null;
    createdAt: string;
  }[];
  /** Screening results and notes; the reviewing staff id stays internal. */
  kycChecks: {
    id: string;
    result: string;
    screeningNote: string;
    sourceOfFundsNote: string | null;
    reviewedAt: string;
    createdAt: string;
  }[];
  /** Metadata only — never the files themselves. */
  kycDocuments: {
    id: string;
    title: string;
    category: string;
    contentType: string;
    createdAt: string;
  }[];
  accessEvents: {
    id: string;
    occurredAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    uaBrowser: string | null;
    uaOs: string | null;
    uaDevice: string | null;
    countryCode: string | null;
    countryName: string | null;
    region: string | null;
    city: string | null;
    timezone: string | null;
    isp: string | null;
    org: string | null;
    isProxy: boolean | null;
    isVpn: boolean | null;
    isDatacenter: boolean | null;
    enrichmentStatus: string;
    enrichmentSource: string;
  }[];
};

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Assembles the export for one investor. Callers must pass session-derived
 * ids — never client-supplied ones (exportMyData in ./actions does this).
 */
export async function collectInvestorDataExport(input: {
  investorId: string;
  authUserId: string | null;
}): Promise<InvestorDataExport> {
  const [investorRow] = await db
    .select({
      id: investors.id,
      authUserId: investors.authUserId,
      email: investors.email,
      fullName: investors.fullName,
      country: investors.country,
      phone: investors.phone,
      accountType: investors.accountType,
      onboardingStatus: investors.onboardingStatus,
      accountStatus: investors.accountStatus,
      kycStatus: investors.kycStatus,
      kycRejectReason: investors.kycRejectReason,
      eligibilityAnswers: investors.eligibilityAnswers,
      termsAcceptedAt: investors.termsAcceptedAt,
      riskAcceptedAt: investors.riskAcceptedAt,
      createdAt: investors.createdAt,
      updatedAt: investors.updatedAt
    })
    .from(investors)
    .where(eq(investors.id, input.investorId))
    .limit(1);

  const authUserRow = input.authUserId
    ? (
        await db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          })
          .from(user)
          .where(eq(user.id, input.authUserId))
          .limit(1)
      )[0]
    : undefined;

  const [leadRow] = await db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      email: leads.email,
      phone: leads.phone,
      notes: leads.notes,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt
    })
    .from(leads)
    .where(eq(leads.investorId, input.investorId))
    .limit(1);

  const applicationRows = await db
    .select({
      id: investorApplications.id,
      accountType: investorApplications.accountType,
      firstName: investorApplications.firstName,
      lastName: investorApplications.lastName,
      email: investorApplications.email,
      phone: investorApplications.phone,
      countryOfResidence: investorApplications.countryOfResidence,
      companyLegalName: investorApplications.companyLegalName,
      countryOfIncorporation: investorApplications.countryOfIncorporation,
      investmentProfile: investorApplications.investmentProfile,
      termsAcceptedAt: investorApplications.termsAcceptedAt,
      riskAcceptedAt: investorApplications.riskAcceptedAt,
      status: investorApplications.status,
      createdAt: investorApplications.createdAt,
      updatedAt: investorApplications.updatedAt
    })
    .from(investorApplications)
    .where(eq(investorApplications.investorId, input.investorId))
    .orderBy(desc(investorApplications.createdAt));

  const interestRows = await db
    .select({
      id: interests.id,
      assetSlug: assets.slug,
      assetName: assets.name,
      amountEur: interests.amountEur,
      optionId: interests.optionId,
      note: interests.note,
      status: interests.status,
      createdAt: interests.createdAt,
      updatedAt: interests.updatedAt
    })
    .from(interests)
    .leftJoin(assets, eq(interests.assetId, assets.id))
    .where(eq(interests.investorId, input.investorId))
    .orderBy(desc(interests.createdAt));

  const holdingRows = await db
    .select({
      id: holdings.id,
      assetSlug: assets.slug,
      assetName: assets.name,
      amountEur: holdings.amountEur,
      targetYieldPct: holdings.targetYieldPct,
      status: holdings.status,
      confirmedAt: holdings.confirmedAt,
      createdAt: holdings.createdAt
    })
    .from(holdings)
    .leftJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.investorId, input.investorId))
    .orderBy(desc(holdings.createdAt));

  const distributionRows = await db
    .select({
      id: distributions.id,
      holdingId: distributions.holdingId,
      amountEur: distributions.amountEur,
      type: distributions.type,
      status: distributions.status,
      periodLabel: distributions.periodLabel,
      paidAt: distributions.paidAt,
      note: distributions.note,
      createdAt: distributions.createdAt
    })
    .from(distributions)
    .where(eq(distributions.investorId, input.investorId))
    .orderBy(desc(distributions.createdAt));

  const kycCheckRows = await db
    .select({
      id: kycChecks.id,
      result: kycChecks.result,
      screeningNote: kycChecks.screeningNote,
      sourceOfFundsNote: kycChecks.sourceOfFundsNote,
      reviewedAt: kycChecks.reviewedAt,
      createdAt: kycChecks.createdAt
    })
    .from(kycChecks)
    .where(eq(kycChecks.investorId, input.investorId))
    .orderBy(desc(kycChecks.reviewedAt));

  const kycDocRows = await db
    .select({
      id: documents.id,
      title: documents.title,
      category: documents.category,
      contentType: documents.contentType,
      createdAt: documents.createdAt
    })
    .from(documents)
    .where(and(eq(documents.ownerType, "investor"), eq(documents.ownerId, input.investorId)))
    .orderBy(desc(documents.createdAt));

  const accessRows = input.authUserId
    ? await db
        .select({
          id: userAccessEvents.id,
          occurredAt: userAccessEvents.occurredAt,
          ipAddress: userAccessEvents.ipAddress,
          userAgent: userAccessEvents.userAgent,
          uaBrowser: userAccessEvents.uaBrowser,
          uaOs: userAccessEvents.uaOs,
          uaDevice: userAccessEvents.uaDevice,
          countryCode: userAccessEvents.countryCode,
          countryName: userAccessEvents.countryName,
          region: userAccessEvents.region,
          city: userAccessEvents.city,
          timezone: userAccessEvents.timezone,
          isp: userAccessEvents.isp,
          org: userAccessEvents.org,
          isProxy: userAccessEvents.isProxy,
          isVpn: userAccessEvents.isVpn,
          isDatacenter: userAccessEvents.isDatacenter,
          enrichmentStatus: userAccessEvents.enrichmentStatus,
          enrichmentSource: userAccessEvents.enrichmentSource
        })
        .from(userAccessEvents)
        .where(eq(userAccessEvents.authUserId, input.authUserId))
        .orderBy(desc(userAccessEvents.occurredAt))
    : [];

  return {
    generatedAt: new Date().toISOString(),
    investor: investorRow
      ? {
          ...investorRow,
          termsAcceptedAt: iso(investorRow.termsAcceptedAt),
          riskAcceptedAt: iso(investorRow.riskAcceptedAt),
          createdAt: investorRow.createdAt.toISOString(),
          updatedAt: investorRow.updatedAt.toISOString()
        }
      : null,
    authUser: authUserRow
      ? {
          ...authUserRow,
          createdAt: authUserRow.createdAt.toISOString(),
          updatedAt: authUserRow.updatedAt.toISOString()
        }
      : null,
    lead: leadRow
      ? {
          ...leadRow,
          createdAt: leadRow.createdAt.toISOString(),
          updatedAt: leadRow.updatedAt.toISOString()
        }
      : null,
    applications: applicationRows.map((row) => ({
      ...row,
      termsAcceptedAt: row.termsAcceptedAt.toISOString(),
      riskAcceptedAt: row.riskAcceptedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    })),
    interests: interestRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    })),
    holdings: holdingRows.map((row) => ({
      ...row,
      confirmedAt: row.confirmedAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    })),
    distributions: distributionRows.map((row) => ({
      ...row,
      paidAt: iso(row.paidAt),
      createdAt: row.createdAt.toISOString()
    })),
    kycChecks: kycCheckRows.map((row) => ({
      ...row,
      reviewedAt: row.reviewedAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    })),
    kycDocuments: kycDocRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString()
    })),
    accessEvents: accessRows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString()
    }))
  };
}

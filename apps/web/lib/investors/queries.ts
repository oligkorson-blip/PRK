import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { agentRosterScopeForStaff, investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import {
  assets,
  db,
  distributions,
  documents,
  holdings,
  interests,
  investorApplications,
  investors,
  staffProfiles
} from "@/lib/db";
import type { DistributionRow } from "@/lib/portfolio/distributions";

/**
 * Read-side data access for the investors domain. Plain module (no
 * "use server"): runs inside server pages/components and other lib modules;
 * none of these functions are registered as RPC server actions.
 */

export type InvestorRow = {
  id: string;
  email: string;
  fullName: string;
  accountStatus: "pending_access" | "active" | "suspended";
  poolInvestmentsEnabled: boolean;
  kycStatus: "not_started" | "submitted" | "under_review" | "approved" | "rejected";
  applicationStatus: "submitted" | "contacted" | "approved" | "rejected" | null;
  applicationCreatedAt: Date | null;
  assignedAgentId: string | null;
  assignedAgentEmail: string | null;
  ibId: string | null;
  ibEmail: string | null;
};

export async function listInvestorsForStaff(): Promise<InvestorRow[]> {
  const staff = await requireStaff();
  const assignedAgent = alias(staffProfiles, "assigned_agent");
  const ib = alias(staffProfiles, "ib");

  const base = db
    .select({
      id: investors.id,
      email: investors.email,
      fullName: investors.fullName,
      accountStatus: investors.accountStatus,
      poolInvestmentsEnabled: investors.poolInvestmentsEnabled,
      kycStatus: investors.kycStatus,
      assignedAgentId: investors.assignedAgentId,
      assignedAgentEmail: assignedAgent.email,
      ibId: investors.ibId,
      ibEmail: ib.email
    })
    .from(investors)
    .leftJoin(assignedAgent, eq(investors.assignedAgentId, assignedAgent.id))
    .leftJoin(ib, eq(investors.ibId, ib.id));

  const rows =
    staff.role === "super_admin"
      ? await base.orderBy(asc(investors.email))
      : staff.role === "ib"
        ? await base.where(eq(investors.ibId, staff.staff.id)).orderBy(asc(investors.email))
        : await base
            .where(eq(investors.assignedAgentId, staff.staff.id))
            .orderBy(asc(investors.email));

  if (rows.length === 0) return [];

  const apps = await db
    .select({
      investorId: investorApplications.investorId,
      status: investorApplications.status,
      createdAt: investorApplications.createdAt
    })
    .from(investorApplications)
    .where(
      inArray(
        investorApplications.investorId,
        rows.map((r) => r.id)
      )
    )
    .orderBy(desc(investorApplications.createdAt));

  const latestApp = new Map<
    string,
    { status: InvestorRow["applicationStatus"]; createdAt: Date }
  >();
  for (const app of apps) {
    if (!latestApp.has(app.investorId)) {
      latestApp.set(app.investorId, { status: app.status, createdAt: app.createdAt });
    }
  }

  return rows.map((row) => {
    const app = latestApp.get(row.id);
    return {
      ...row,
      applicationStatus: app?.status ?? null,
      applicationCreatedAt: app?.createdAt ?? null
    };
  });
}

export async function listAgents(): Promise<
  { id: string; email: string; ibId: string | null; ibEmail: string | null }[]
> {
  const staff = await requireStaff();
  const rosterScope = agentRosterScopeForStaff({
    role: staff.role,
    staffId: staff.staff.id
  });
  if (!rosterScope.allowed) throw new Error("FORBIDDEN");

  const ib = alias(staffProfiles, "ib");
  const conditions = [eq(staffProfiles.role, "agent"), isNull(staffProfiles.deactivatedAt)];
  if (rosterScope.ibId) {
    conditions.push(eq(staffProfiles.ibId, rosterScope.ibId));
  }

  return db
    .select({
      id: staffProfiles.id,
      email: staffProfiles.email,
      ibId: staffProfiles.ibId,
      ibEmail: ib.email
    })
    .from(staffProfiles)
    .leftJoin(ib, eq(staffProfiles.ibId, ib.id))
    .where(and(...conditions))
    .orderBy(asc(staffProfiles.email));
}

/** Single lookup of an investor by its linked auth user id (no provisioning). */
export async function findInvestorByAuthUserId(authUserId: string) {
  const [investor] = await db
    .select()
    .from(investors)
    .where(eq(investors.authUserId, authUserId))
    .limit(1);
  return investor ?? null;
}

/** Latest application status for the investor's portal timeline, if any. */
export async function getLatestApplicationStatusForInvestor(investorId: string) {
  const [application] = await db
    .select({ status: investorApplications.status })
    .from(investorApplications)
    .where(eq(investorApplications.investorId, investorId))
    .orderBy(desc(investorApplications.createdAt))
    .limit(1);
  return application?.status ?? null;
}

export type InvestorApplicationRow = {
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
  status: "submitted" | "contacted" | "approved" | "rejected";
  opsNote: string | null;
  createdAt: Date;
};

export type InvestorKycDocRow = {
  id: string;
  title: string;
  category: string;
  createdAt: Date;
};

export type InvestorInterestRow = {
  id: string;
  amountEur: string | number;
  status: string;
  createdAt: Date;
  assetName: string;
  assetSlug: string;
};

export type InvestorHoldingRow = {
  id: string;
  amountEur: number;
  targetYieldPct: string;
  status: "active" | "closed";
  confirmedAt: Date;
  assetName: string;
  assetSlug: string;
};

/** DistributionRow plus createdAt so scheduled rows (paidAt null) still show a date. */
export type InvestorDistributionRow = DistributionRow & { createdAt: Date };

export async function getInvestorApplicationBundle(investorId: string): Promise<{
  application: InvestorApplicationRow | null;
  kycDocs: InvestorKycDocRow[];
  interests: InvestorInterestRow[];
  holdings: InvestorHoldingRow[];
  distributions: InvestorDistributionRow[];
}> {
  const staff = await requireStaff();

  const [investor] = await db
    .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);

  if (!investor) {
    throw new Error("NOT_FOUND");
  }

  if (
    !investorVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      investor: { assignedAgentId: investor.assignedAgentId, ibId: investor.ibId }
    })
  ) {
    throw new Error("NOT_FOUND");
  }

  const [application] = await db
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
      status: investorApplications.status,
      opsNote: investorApplications.opsNote,
      createdAt: investorApplications.createdAt
    })
    .from(investorApplications)
    .where(eq(investorApplications.investorId, investorId))
    .orderBy(desc(investorApplications.createdAt))
    .limit(1);

  const docs = await db
    .select({
      id: documents.id,
      title: documents.title,
      category: documents.category,
      createdAt: documents.createdAt
    })
    .from(documents)
    .where(and(eq(documents.ownerType, "investor"), eq(documents.ownerId, investorId)))
    .orderBy(desc(documents.createdAt));

  const interestRows = await db
    .select({
      id: interests.id,
      amountEur: interests.amountEur,
      status: interests.status,
      createdAt: interests.createdAt,
      assetName: assets.name,
      assetSlug: assets.slug
    })
    .from(interests)
    .innerJoin(assets, eq(interests.assetId, assets.id))
    .where(eq(interests.investorId, investorId))
    .orderBy(desc(interests.createdAt));

  const holdingRows = await db
    .select({
      id: holdings.id,
      amountEur: holdings.amountEur,
      targetYieldPct: holdings.targetYieldPct,
      status: holdings.status,
      confirmedAt: holdings.confirmedAt,
      assetName: assets.name,
      assetSlug: assets.slug
    })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.investorId, investorId))
    .orderBy(desc(holdings.confirmedAt));

  const distributionRows = await db
    .select({
      id: distributions.id,
      amountEur: distributions.amountEur,
      type: distributions.type,
      status: distributions.status,
      periodLabel: distributions.periodLabel,
      paidAt: distributions.paidAt,
      createdAt: distributions.createdAt
    })
    .from(distributions)
    .where(eq(distributions.investorId, investorId))
    .orderBy(desc(distributions.paidAt), desc(distributions.createdAt));

  return {
    application: application ?? null,
    kycDocs: docs,
    interests: interestRows,
    holdings: holdingRows,
    distributions: distributionRows.map((r) => ({ ...r, amountEur: Number(r.amountEur) }))
  };
}

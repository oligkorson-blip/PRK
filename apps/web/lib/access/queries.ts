import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authUserVisibleToStaff } from "@/lib/access/scope";
import { requireSessionUser } from "@/lib/auth/session";
import { requireStaff } from "@/lib/auth/staff";
import { db, staffProfiles, userAccessEvents, investors } from "@/lib/db";

/**
 * Read-side data access for sign-in/access history and the staff investor
 * detail view. Plain module (no "use server"): runs inside server pages
 * only; none of these functions are registered as RPC server actions.
 * This module replaces the former read-only lib/access/admin-actions.ts.
 */

export type AccessEventRow = {
  id: string;
  occurredAt: Date;
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
  enrichmentStatus: "pending" | "ok" | "partial" | "failed";
  enrichmentSource: "api" | "local" | "none";
};

export type InvestorDetail = {
  id: string;
  authUserId: string | null;
  email: string;
  fullName: string;
  country: string;
  phone: string | null;
  accountStatus: "pending_access" | "active" | "suspended";
  onboardingStatus: "started" | "completed";
  kycStatus: "not_started" | "submitted" | "under_review" | "approved" | "rejected";
  kycRejectReason: string | null;
  assignedAgentId: string | null;
  assignedAgentEmail: string | null;
  ibId: string | null;
  ibEmail: string | null;
  dateOfBirth: string | null;
  address: string | null;
  nationality: string | null;
  accountType: "individual" | "company" | null;
  companyLegalName: string | null;
  countryOfIncorporation: string | null;
  companyNumber: string | null;
  pepDeclaration: boolean | null;
  eligibilityAnswers: Record<string, unknown>;
};

async function assertAuthUserVisibleToStaff(
  staff: Awaited<ReturnType<typeof requireStaff>>,
  authUserId: string
): Promise<void> {
  const [investor] = await db
    .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
    .from(investors)
    .where(eq(investors.authUserId, authUserId))
    .limit(1);

  if (investor) {
    if (
      !authUserVisibleToStaff({
        role: staff.role,
        staffId: staff.staff.id,
        target: { kind: "investor", assignedAgentId: investor.assignedAgentId, ibId: investor.ibId }
      })
    ) {
      throw new Error("NOT_FOUND");
    }
    return;
  }

  const [staffProfile] = await db
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.authUserId, authUserId))
    .limit(1);

  if (!staffProfile) {
    throw new Error("NOT_FOUND");
  }

  if (
    !authUserVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      target: { kind: "staff" }
    })
  ) {
    throw new Error("NOT_FOUND");
  }
}

// Safety bound: the staff sign-in history view materializes the rows it
// returns, so cap it at the most recent events instead of reading an
// account's entire history into memory. 500 is far beyond any UI need;
// revisit with cursor pagination if that ever changes.
const MAX_ACCESS_EVENTS_PER_USER = 500;

export async function listAccessEventsForAuthUser(
  authUserId: string
): Promise<AccessEventRow[]> {
  const staff = await requireStaff();
  await assertAuthUserVisibleToStaff(staff, authUserId);

  return db
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
    .where(eq(userAccessEvents.authUserId, authUserId))
    .orderBy(desc(userAccessEvents.occurredAt))
    .limit(MAX_ACCESS_EVENTS_PER_USER);
}

export async function getInvestorDetailForStaff(
  investorId: string
): Promise<InvestorDetail> {
  const staff = await requireStaff();
  const assignedAgent = alias(staffProfiles, "assigned_agent");
  const ib = alias(staffProfiles, "ib");

  const [investor] = await db
    .select({
      id: investors.id,
      authUserId: investors.authUserId,
      email: investors.email,
      fullName: investors.fullName,
      country: investors.country,
      phone: investors.phone,
      accountStatus: investors.accountStatus,
      onboardingStatus: investors.onboardingStatus,
      kycStatus: investors.kycStatus,
      kycRejectReason: investors.kycRejectReason,
      assignedAgentId: investors.assignedAgentId,
      assignedAgentEmail: assignedAgent.email,
      ibId: investors.ibId,
      ibEmail: ib.email,
      dateOfBirth: investors.dateOfBirth,
      address: investors.address,
      nationality: investors.nationality,
      accountType: investors.accountType,
      companyLegalName: investors.companyLegalName,
      countryOfIncorporation: investors.countryOfIncorporation,
      companyNumber: investors.companyNumber,
      pepDeclaration: investors.pepDeclaration,
      eligibilityAnswers: investors.eligibilityAnswers
    })
    .from(investors)
    .leftJoin(assignedAgent, eq(investors.assignedAgentId, assignedAgent.id))
    .leftJoin(ib, eq(investors.ibId, ib.id))
    .where(eq(investors.id, investorId))
    .limit(1);

  if (!investor) {
    throw new Error("NOT_FOUND");
  }

  if (
    !authUserVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      target: { kind: "investor", assignedAgentId: investor.assignedAgentId, ibId: investor.ibId }
    })
  ) {
    throw new Error("NOT_FOUND");
  }

  return investor;
}

/**
 * Self-scoped sign-in history for the account security surface. No staff
 * gate: the signed-in user may only ever read their own rows.
 */
export async function listOwnAccessEvents(limit = 10): Promise<AccessEventRow[]> {
  const user = await requireSessionUser();

  return db
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
    .where(eq(userAccessEvents.authUserId, user.id))
    .orderBy(desc(userAccessEvents.occurredAt))
    .limit(limit);
}

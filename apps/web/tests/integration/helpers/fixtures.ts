/**
 * Seed/query fixtures for the integration suite. All helpers go through the
 * app's own `db` handle and schema so tests exercise the real tables,
 * constraints, and indexes — nothing is stubbed.
 */
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  account,
  assets,
  auditEvents,
  db,
  distributions,
  documents,
  holdings,
  interests,
  investorApplications,
  investors,
  inviteTokens,
  kycChecks,
  leadAssignments,
  leadLists,
  leads,
  staffProfiles,
  user
} from "@/lib/db";

let seq = 0;

/** Unique-within-the-run token for emails, slugs, and names. */
export function uniq(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${process.pid.toString(36)}-${seq}`;
}

export function uniqEmail(prefix: string): string {
  return `${uniq(prefix)}@example.com`;
}

/* ------------------------------------------------------------------ */
/* Auth users + staff                                                  */
/* ------------------------------------------------------------------ */

export async function createAuthUser(email: string, name?: string) {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: name ?? email,
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return { id, email };
}

export async function createStaff(input: {
  email: string;
  role: "super_admin" | "ib" | "agent";
  ibId?: string | null;
}) {
  const authUser = await createAuthUser(input.email);
  const [profile] = await db
    .insert(staffProfiles)
    .values({
      authUserId: authUser.id,
      email: input.email,
      role: input.role,
      ibId: input.ibId ?? null
    })
    .returning();
  return { authUser, profile };
}

/* ------------------------------------------------------------------ */
/* Investors + applications                                            */
/* ------------------------------------------------------------------ */

export async function createInvestor(input: {
  email: string;
  fullName?: string;
  ibId?: string | null;
  assignedAgentId?: string | null;
  kycStatus?: "not_started" | "submitted" | "under_review" | "approved" | "rejected";
  accountStatus?: "pending_access" | "active" | "suspended";
  poolInvestmentsEnabled?: boolean;
  accountType?: "individual" | "company";
  onboardingComplete?: boolean;
  withAuthUser?: boolean;
}) {
  const authUser = input.withAuthUser === false ? null : await createAuthUser(input.email);
  const complete = input.onboardingComplete ?? true;
  const [investor] = await db
    .insert(investors)
    .values({
      authUserId: authUser?.id ?? null,
      email: input.email,
      fullName: input.fullName ?? "Test Investor",
      onboardingStatus: complete ? "completed" : "started",
      accountStatus: input.accountStatus ?? "active",
      poolInvestmentsEnabled: input.poolInvestmentsEnabled ?? false,
      accountType: input.accountType ?? "individual",
      kycStatus: input.kycStatus ?? "approved",
      termsAcceptedAt: complete ? new Date() : null,
      riskAcceptedAt: complete ? new Date() : null,
      ibId: input.ibId ?? null,
      assignedAgentId: input.assignedAgentId ?? null
    })
    .returning();
  return { investor, authUser };
}

export async function createApplication(
  investorId: string,
  input?: { email?: string; status?: "submitted" | "contacted" | "approved" | "rejected" }
) {
  const [application] = await db
    .insert(investorApplications)
    .values({
      investorId,
      accountType: "individual",
      firstName: "Test",
      lastName: "Investor",
      email: input?.email ?? uniqEmail("app"),
      phone: "+353 1 555 0100",
      countryOfResidence: "Ireland",
      termsAcceptedAt: new Date(),
      riskAcceptedAt: new Date(),
      status: input?.status ?? "submitted"
    })
    .returning();
  return application;
}

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

export async function createLeadList(createdByStaffId: string, name?: string) {
  const [list] = await db
    .insert(leadLists)
    .values({ name: name ?? uniq("list"), defaultSource: "csv", createdByStaffId })
    .returning();
  return list;
}

export async function createLead(input: {
  listId: string;
  fullName?: string;
  email?: string;
  ibId?: string | null;
  assignedAgentId?: string | null;
  investorId?: string | null;
  status?: "new" | "contacted" | "qualified" | "unqualified" | "duplicate" | "converted";
  lastActivityAt?: Date | null;
}) {
  const [lead] = await db
    .insert(leads)
    .values({
      listId: input.listId,
      fullName: input.fullName ?? "Test Lead",
      email: input.email ?? uniqEmail("lead"),
      source: "csv",
      status: input.status ?? "new",
      ibId: input.ibId ?? null,
      assignedAgentId: input.assignedAgentId ?? null,
      investorId: input.investorId ?? null,
      ...(input.lastActivityAt !== undefined ? { lastActivityAt: input.lastActivityAt } : {})
    })
    .returning();
  return lead;
}

/* ------------------------------------------------------------------ */
/* Assets / interests / holdings / distributions                       */
/* ------------------------------------------------------------------ */

export async function createAsset(input?: {
  slug?: string;
  status?: "draft" | "published" | "closed";
  minTicketEur?: number;
}) {
  const slug = input?.slug ?? uniq("asset");
  const [asset] = await db
    .insert(assets)
    .values({
      slug,
      name: `Test Asset ${slug}`,
      operator: "Test Operator",
      city: "Dublin",
      district: "Dublin 2",
      country: "Ireland",
      targetYieldPct: "7.50",
      tier: "core",
      minTicketEur: input?.minTicketEur ?? 10_000,
      spaces: 100,
      occupancyPct: "95.00",
      leaseLabel: "5-year lease",
      blurb: "Integration test asset.",
      status: input?.status ?? "published"
    })
    .returning();
  return asset;
}

export async function createInterestRow(input: {
  investorId: string;
  assetId: string;
  amountEur?: number;
  status?: "pending" | "confirmed" | "declined" | "withdrawn";
  createdAt?: Date;
}) {
  const [interest] = await db
    .insert(interests)
    .values({
      investorId: input.investorId,
      assetId: input.assetId,
      amountEur: input.amountEur ?? 10_000,
      status: input.status ?? "pending",
      ...(input.createdAt ? { createdAt: input.createdAt } : {})
    })
    .returning();
  return interest;
}

export async function createHolding(input: {
  investorId: string;
  assetId: string;
  interestId: string;
  amountEur?: number;
  status?: "active" | "closed";
}) {
  const [holding] = await db
    .insert(holdings)
    .values({
      investorId: input.investorId,
      assetId: input.assetId,
      interestId: input.interestId,
      amountEur: input.amountEur ?? 10_000,
      targetYieldPct: "7.50",
      status: input.status ?? "active",
      confirmedAt: new Date()
    })
    .returning();
  return holding;
}

/** AML screening record — confirmInterest requires a "clear" one (kyc_checks). */
export async function createKycCheck(input: {
  investorId: string;
  reviewedByStaffId: string;
  result?: "clear" | "review" | "rejected";
  reviewedAt?: Date;
}) {
  const [check] = await db
    .insert(kycChecks)
    .values({
      investorId: input.investorId,
      reviewedByStaffId: input.reviewedByStaffId,
      result: input.result ?? "clear",
      screeningNote: "Integration test screening.",
      ...(input.reviewedAt ? { reviewedAt: input.reviewedAt } : {})
    })
    .returning();
  return check;
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export async function createDocument(input: {
  ownerType: "asset" | "holding" | "platform" | "investor";
  ownerId?: string | null;
  title?: string;
  category?: string;
  uploadedBy: string;
}) {
  const [doc] = await db
    .insert(documents)
    .values({
      ownerType: input.ownerType,
      ownerId: input.ownerId ?? null,
      title: input.title ?? `${uniq("doc")}.pdf`,
      category: input.category ?? "kid",
      storageKey: `integration/${uniq("key")}.pdf`,
      contentType: "application/pdf",
      uploadedBy: input.uploadedBy
    })
    .returning();
  return doc;
}

export async function getDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return doc;
}

/* ------------------------------------------------------------------ */
/* Read-side helpers                                                   */
/* ------------------------------------------------------------------ */

export async function getLead(id: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return lead;
}

export async function getInvestor(id: string) {
  const [investor] = await db.select().from(investors).where(eq(investors.id, id)).limit(1);
  return investor;
}

export async function getInvestorByEmail(email: string) {
  const [investor] = await db.select().from(investors).where(eq(investors.email, email)).limit(1);
  return investor;
}

export async function getStaffProfile(id: string) {
  const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.id, id)).limit(1);
  return profile;
}

export async function getStaffProfileByAuthUserId(authUserId: string) {
  const [profile] = await db
    .select()
    .from(staffProfiles)
    .where(eq(staffProfiles.authUserId, authUserId))
    .limit(1);
  return profile;
}

export async function listAssignmentsForLead(leadId: string) {
  return db
    .select()
    .from(leadAssignments)
    .where(eq(leadAssignments.leadId, leadId))
    .orderBy(desc(leadAssignments.createdAt));
}

export async function listInviteTokensForInvestor(investorId: string) {
  return db.select().from(inviteTokens).where(eq(inviteTokens.investorId, investorId));
}

export async function listAuditEvents(action: string, entityId?: string) {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.action, action))
    .orderBy(desc(auditEvents.createdAt));
  return entityId ? rows.filter((row) => row.entityId === entityId) : rows;
}

export { account, assets, auditEvents, db, distributions, documents, holdings, interests, investorApplications, investors, inviteTokens, kycChecks, leads, staffProfiles, user };

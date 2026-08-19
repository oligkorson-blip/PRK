import { and, desc, eq, gte, inArray, lt, notInArray } from "drizzle-orm";
import type { StaffRole } from "@/lib/auth/roles";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import {
  auditEvents,
  db,
  distributions,
  documents,
  holdings,
  interests,
  investors,
  leads,
  user
} from "@/lib/db";
import { staffCanAccessAdminDocument, type DocumentAccessRow } from "@/lib/documents/access";
import { TERMINAL_LEAD_STATUSES } from "@/lib/leads/labels";
import { leadVisibleToStaff } from "@/lib/leads/scope";
import { STALE_AFTER_DAYS } from "@/lib/leads/stale";
import { formatDateDdMmYyyy } from "@/lib/format";

/**
 * Read-side data access for the /admin dashboard. Plain module (no
 * "use server"): runs inside the admin page only. Staff-scoped functions
 * take the already-authorized role/id explicitly — requireStaff stays in
 * the page (same pattern as lib/interests/queries.ts).
 */

export type StaffScope = { role: StaffRole; staffId: string };

/** Compact relative timestamp for the activity feed ("15 min ago", "3 h ago"). */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDateDdMmYyyy(date);
}

/** Lead-stage labels for friendly feed lines (label-map pattern from lib/portal/labels.ts). */
const LEAD_STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  unqualified: "Unqualified",
  duplicate: "Duplicate",
  converted: "Converted"
};

/**
 * Resolved investor/lead the event concerns, when the feed could name it
 * (batch-loaded with the scope lookups in listScopedActivityForStaff).
 */
export type AuditEventEntityRef = { type: "investor" | "lead"; name: string };

/**
 * Friendly sentence fragment for one audit event, rendered after the actor
 * email ("sara@… moved jane@… to Qualified"). When the entity the event
 * concerns was resolved in the caller's scope, the line names it; otherwise
 * it falls back to the generic form. Never returns the raw action key:
 * unknown actions fall back to a generic line. Opportunity (not "asset") is
 * the user-facing term for asset events, matching the public site.
 */
export function describeAuditEvent(
  event: {
    action: string;
    entityType: string;
    payload: Record<string, unknown>;
  },
  entity: AuditEventEntityRef | null = null
): string {
  const status = typeof event.payload.status === "string" ? event.payload.status : null;
  const investorName = entity?.type === "investor" ? entity.name : null;
  const leadName = entity?.type === "lead" ? entity.name : null;
  switch (event.action) {
    case "lead.status_changed":
      return `moved ${leadName ?? "a lead"} to ${LEAD_STATUS_LABEL[status ?? ""] ?? "a new stage"}`;
    case "lead.call_logged":
      return `logged a call with ${leadName ?? "a lead"}`;
    case "lead.follow_up_changed":
      return leadName
        ? `updated the follow-up date for ${leadName}`
        : "updated a lead follow-up date";
    case "lead.linked_on_signup":
      return leadName ? `linked ${leadName} to a new sign-up` : "linked a lead to a new sign-up";
    case "leads.uploaded":
      return "uploaded leads from CSV";
    case "lead_list.created":
      return "created a lead list";
    case "investor.created":
      return investorName ? `added investor ${investorName}` : "added an investor";
    case "investor.assigned":
      return investorName ? `reassigned ${investorName}` : "reassigned an investor";
    case "investor.invited":
      return investorName
        ? `invited ${investorName} to the portal`
        : "invited an investor to the portal";
    case "kyc.submitted":
      return investorName
        ? `submitted KYC documents for ${investorName}`
        : "submitted KYC documents";
    case "kyc.document_uploaded":
    case "kyc.assisted_upload":
      return investorName
        ? `uploaded a KYC document for ${investorName}`
        : "uploaded a KYC document";
    case "kyc.approved":
      return investorName ? `approved KYC for ${investorName}` : "approved KYC";
    case "kyc.under_review":
      return investorName
        ? `marked KYC as under review for ${investorName}`
        : "marked KYC as under review";
    case "kyc.rejected":
      return investorName ? `rejected KYC for ${investorName}` : "rejected KYC";
    case "interest.created":
      return investorName
        ? `registered an investment interest for ${investorName}`
        : "registered an investment interest";
    case "contract.created_from_interest":
      return investorName
        ? `created an agreement from a confirmed interest for ${investorName}`
        : "created an agreement from a confirmed interest";
    case "lead.converted_to_investor":
      return leadName
        ? `converted ${leadName} to an investor invite`
        : "converted a lead to an investor invite";
    case "interest.confirm_first_approval":
      return investorName
        ? `gave a first approval to an investment for ${investorName}`
        : "gave a first approval to an investment";
    case "interest.confirmed":
      return investorName
        ? `confirmed an investment for ${investorName}`
        : "confirmed an investment";
    case "interest.declined":
      return investorName ? `declined an interest for ${investorName}` : "declined an interest";
    case "interest.withdrawn":
      return investorName ? `withdrew an interest for ${investorName}` : "withdrew an interest";
    case "distribution.recorded":
      return investorName
        ? `recorded a distribution for ${investorName}`
        : "recorded a distribution";
    case "document.uploaded":
      return investorName ? `uploaded a document for ${investorName}` : "uploaded a document";
    case "document.downloaded":
      return investorName
        ? `downloaded a document for ${investorName}`
        : "downloaded a document";
    case "application.submitted":
      return investorName
        ? `received an application from ${investorName}`
        : "received an application";
    case "application.contacted":
      return investorName
        ? `marked the application from ${investorName} as contacted`
        : "marked an application as contacted";
    case "application.rejected":
      return investorName
        ? `rejected the application from ${investorName}`
        : "rejected an application";
    case "asset.status_changed":
      return "changed an opportunity status";
    case "asset.capacity_updated":
      return "updated opportunity capacity";
    case "asset.images_updated":
      return "updated opportunity images";
    default:
      return "recorded an activity";
  }
}

/** Batch-loaded ownership records used to scope the activity feed without N+1 queries. */
export type ActivityScopeLookups = {
  investors: Map<string, { assignedAgentId: string | null; ibId: string | null }>;
  leads: Map<string, { assignedAgentId: string | null; ibId: string | null }>;
  interestInvestorIds: Map<string, string>;
  distributionInvestorIds: Map<string, string>;
  documents: Map<string, { ownerType: DocumentAccessRow["ownerType"]; ownerId: string | null }>;
  /** Holding owner's assignment, for scoping holding-document events to the book. */
  holdingOwners: Map<string, { assignedAgentId: string | null; ibId: string | null }>;
};

/**
 * Whether one audit event belongs to the staff member's book. Events whose
 * entity cannot be resolved in scope are skipped (spec D.3); staff_profile
 * and lead_list events are super-admin only; asset events and asset/platform
 * document events are staff-wide (catalogue/ops level, no book boundary).
 * Document events follow staffCanAccessAdminDocument: investor and holding
 * documents stay scoped to their owner's book.
 */
export function isAuditEventVisibleForStaff(
  scope: StaffScope,
  event: { entityType: string; entityId: string | null },
  lookups: ActivityScopeLookups
): boolean {
  if (scope.role === "super_admin") return true;

  const investorVisible = (investorId: string | null | undefined): boolean => {
    if (!investorId) return false;
    const investor = lookups.investors.get(investorId);
    if (!investor) return false;
    return investorVisibleToStaff({ role: scope.role, staffId: scope.staffId, investor });
  };

  switch (event.entityType) {
    case "investor":
      return investorVisible(event.entityId);
    case "lead": {
      const lead = event.entityId ? lookups.leads.get(event.entityId) : undefined;
      if (!lead) return false;
      return leadVisibleToStaff({ role: scope.role, staffId: scope.staffId, lead });
    }
    case "interest":
      return investorVisible(event.entityId ? lookups.interestInvestorIds.get(event.entityId) : null);
    case "distribution":
      return investorVisible(
        event.entityId ? lookups.distributionInvestorIds.get(event.entityId) : null
      );
    case "document": {
      const doc = event.entityId ? lookups.documents.get(event.entityId) : undefined;
      if (!doc) return false;
      // Same scoping as the documents vault: holding docs follow their owner's
      // book (fail-closed when the owner can't be resolved), asset/platform
      // docs stay staff-wide.
      return staffCanAccessAdminDocument({
        role: scope.role,
        staffId: scope.staffId,
        doc: { ownerType: doc.ownerType, ownerId: doc.ownerId },
        holdingOwner: doc.ownerId ? lookups.holdingOwners.get(doc.ownerId) : undefined,
        investorOwner: doc.ownerId ? lookups.investors.get(doc.ownerId) : undefined
      });
    }
    case "asset":
      return true;
    default:
      return false;
  }
}

export type AdminDashboardKpis = {
  investorsInBook: number;
  newLeadsThisWeek: number;
  pendingKyc: number;
  scheduledDistributions: number;
};

/**
 * KPI row for /admin: investors in book, leads created in the last 7 days,
 * KYC awaiting staff review (submitted / under_review), and scheduled
 * distributions — all scoped to the caller's book (super admin: whole pool).
 */
export async function getAdminDashboardKpis(scope: StaffScope): Promise<AdminDashboardKpis> {
  const investorScope =
    scope.role === "super_admin"
      ? undefined
      : scope.role === "ib"
        ? eq(investors.ibId, scope.staffId)
        : eq(investors.assignedAgentId, scope.staffId);
  const leadScope =
    scope.role === "super_admin"
      ? undefined
      : scope.role === "ib"
        ? eq(leads.ibId, scope.staffId)
        : eq(leads.assignedAgentId, scope.staffId);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [investorRows, newLeadRows, kycRows, distributionRows] = await Promise.all([
    db.select({ id: investors.id }).from(investors).where(investorScope),
    db
      .select({ id: leads.id })
      .from(leads)
      .where(and(gte(leads.createdAt, weekAgo), leadScope)),
    db
      .select({ id: investors.id })
      .from(investors)
      .where(and(inArray(investors.kycStatus, ["submitted", "under_review"]), investorScope)),
    db
      .select({ id: distributions.id })
      .from(distributions)
      .innerJoin(investors, eq(distributions.investorId, investors.id))
      .where(and(eq(distributions.status, "scheduled"), investorScope))
  ]);

  return {
    investorsInBook: investorRows.length,
    newLeadsThisWeek: newLeadRows.length,
    pendingKyc: kycRows.length,
    scheduledDistributions: distributionRows.length
  };
}

/**
 * A non-terminal lead with no activity for this many days is "stale" (spec
 * A.2). Reuses the shared STALE_AFTER_DAYS the leads task extracted
 * (lib/leads/stale.ts) instead of keeping its own constant.
 */
export const STALE_LEAD_AFTER_DAYS = STALE_AFTER_DAYS;

/** Stale-lead count for the dashboard widget, scoped to the caller's book. */
export async function getStaleLeadCountForStaff(scope: StaffScope): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_LEAD_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const leadScope =
    scope.role === "super_admin"
      ? undefined
      : scope.role === "ib"
        ? eq(leads.ibId, scope.staffId)
        : eq(leads.assignedAgentId, scope.staffId);

  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        notInArray(leads.status, [...TERMINAL_LEAD_STATUSES]),
        lt(leads.lastActivityAt, staleBefore),
        leadScope
      )
    );

  return rows.length;
}

export type ScopedAuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  actorEmail: string | null;
  createdAt: Date;
  /** Investor/lead the event concerns, named only when resolved in scope. */
  entity: AuditEventEntityRef | null;
  /** Deep link to the record the event concerns, when one exists. */
  href: string | null;
};

export const ACTIVITY_FEED_LIMIT = 15;
/** Over-fetch window for scoped roles so the feed still fills after filtering. */
const ACTIVITY_OVERFETCH = 100;

/** Display name for a feed entity: the person's name when known, else their email. */
function entityDisplayName(row: { fullName?: string | null; email?: string | null }): string | null {
  const name = row.fullName?.trim();
  if (name) return name;
  return row.email ?? null;
}

/**
 * Latest audit events visible within the staff member's scope, newest
 * first. Super admins see the raw latest events; agents/IBs see only their
 * book's events — events whose entity is not resolvable in scope are
 * skipped (spec D.3). Both paths batch-load the same ownership maps; they
 * double as the source for naming the investor/lead each line concerns and
 * for the deep link to its record, so scoping stays fail-closed (a line
 * can never name an out-of-book entity).
 */
export async function listScopedActivityForStaff(
  scope: StaffScope,
  limit: number = ACTIVITY_FEED_LIMIT
): Promise<ScopedAuditEvent[]> {
  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      payload: auditEvents.payload,
      actorEmail: user.email,
      createdAt: auditEvents.createdAt
    })
    .from(auditEvents)
    .leftJoin(user, eq(auditEvents.actorUserId, user.id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(scope.role === "super_admin" ? limit : ACTIVITY_OVERFETCH);

  const entityIdsOf = (entityType: string): string[] => [
    ...new Set(
      rows
        .filter((row) => row.entityType === entityType && row.entityId !== null)
        .map((row) => row.entityId as string)
    )
  ];

  const leadIds = entityIdsOf("lead");
  const interestIds = entityIdsOf("interest");
  const distributionIds = entityIdsOf("distribution");
  const documentIds = entityIdsOf("document");

  const [leadRows, interestRows, distributionRows, documentRows] = await Promise.all([
    leadIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: leads.id,
            assignedAgentId: leads.assignedAgentId,
            ibId: leads.ibId,
            fullName: leads.fullName,
            email: leads.email
          })
          .from(leads)
          .where(inArray(leads.id, leadIds)),
    interestIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: interests.id, investorId: interests.investorId })
          .from(interests)
          .where(inArray(interests.id, interestIds)),
    distributionIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: distributions.id, investorId: distributions.investorId })
          .from(distributions)
          .where(inArray(distributions.id, distributionIds)),
    documentIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: documents.id, ownerType: documents.ownerType, ownerId: documents.ownerId })
          .from(documents)
          .where(inArray(documents.id, documentIds))
  ]);

  const investorIds = new Set<string>(entityIdsOf("investor"));
  for (const row of interestRows) investorIds.add(row.investorId);
  for (const row of distributionRows) investorIds.add(row.investorId);
  for (const row of documentRows) {
    if (row.ownerType === "investor" && row.ownerId) investorIds.add(row.ownerId);
  }

  // Holding-document events scope through the holding's owning investor.
  const holdingIds = [
    ...new Set(
      documentRows
        .filter((row) => row.ownerType === "holding" && row.ownerId)
        .map((row) => row.ownerId as string)
    )
  ];

  const [investorRows, holdingRows] = await Promise.all([
    investorIds.size === 0
      ? Promise.resolve([])
      : db
          .select({
            id: investors.id,
            assignedAgentId: investors.assignedAgentId,
            ibId: investors.ibId,
            fullName: investors.fullName,
            email: investors.email
          })
          .from(investors)
          .where(inArray(investors.id, [...investorIds])),
    holdingIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: holdings.id,
            assignedAgentId: investors.assignedAgentId,
            ibId: investors.ibId
          })
          .from(holdings)
          .innerJoin(investors, eq(holdings.investorId, investors.id))
          .where(inArray(holdings.id, holdingIds))
  ]);

  const lookups: ActivityScopeLookups = {
    investors: new Map(
      investorRows.map((row) => [
        row.id,
        { assignedAgentId: row.assignedAgentId, ibId: row.ibId }
      ])
    ),
    leads: new Map(
      leadRows.map((row) => [row.id, { assignedAgentId: row.assignedAgentId, ibId: row.ibId }])
    ),
    interestInvestorIds: new Map(interestRows.map((row) => [row.id, row.investorId])),
    distributionInvestorIds: new Map(distributionRows.map((row) => [row.id, row.investorId])),
    documents: new Map(
      documentRows.map((row) => [row.id, { ownerType: row.ownerType, ownerId: row.ownerId }])
    ),
    holdingOwners: new Map(
      holdingRows.map((row) => [row.id, { assignedAgentId: row.assignedAgentId, ibId: row.ibId }])
    )
  };

  const investorNames = new Map(investorRows.map((row) => [row.id, entityDisplayName(row)]));
  const leadNames = new Map(leadRows.map((row) => [row.id, entityDisplayName(row)]));

  /** Resolve the entity a visible event concerns (name + record link). */
  const resolveEntity = (
    row: (typeof rows)[number]
  ): { entity: AuditEventEntityRef | null; href: string | null } => {
    const investorRef = (
      investorId: string | null | undefined
    ): { entity: AuditEventEntityRef | null; href: string | null } => {
      if (!investorId) return { entity: null, href: null };
      const name = investorNames.get(investorId) ?? null;
      return {
        entity: name ? { type: "investor", name } : null,
        href: `/admin/investors/${investorId}`
      };
    };

    switch (row.entityType) {
      case "investor":
        return investorRef(row.entityId);
      case "lead": {
        if (!row.entityId) return { entity: null, href: null };
        const name = leadNames.get(row.entityId) ?? null;
        return {
          entity: name ? { type: "lead", name } : null,
          href: `/admin/leads/lead/${row.entityId}`
        };
      }
      case "interest":
        return investorRef(row.entityId ? lookups.interestInvestorIds.get(row.entityId) : null);
      case "distribution":
        return investorRef(row.entityId ? lookups.distributionInvestorIds.get(row.entityId) : null);
      case "document": {
        const doc = row.entityId ? lookups.documents.get(row.entityId) : undefined;
        if (doc?.ownerType === "investor") return investorRef(doc.ownerId);
        return { entity: null, href: null };
      }
      case "asset":
        // Opportunity events are catalogue-level: link to the Assets workspace.
        return { entity: null, href: "/admin/assets" };
      default:
        return { entity: null, href: null };
    }
  };

  const visible =
    scope.role === "super_admin"
      ? rows
      : rows.filter((row) => isAuditEventVisibleForStaff(scope, row, lookups));

  return visible.slice(0, limit).map((row) => ({ ...row, ...resolveEntity(row) }));
}

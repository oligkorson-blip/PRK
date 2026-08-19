import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { agentRosterScopeForStaff, requireStaff, requireSuperAdmin } from "@/lib/auth/staff";
import {
  db,
  leadAssignments,
  leadCallAttempts,
  leadLists,
  leads,
  staffProfiles
} from "@/lib/db";
import type { LeadCallOutcome } from "./outcomes";
import { leadVisibleToStaff } from "./scope";
import { LEAD_STATUS_VALUES, TERMINAL_LEAD_STATUSES, type LeadStatus } from "./labels";
import { STALE_AFTER_DAYS } from "./stale";

/**
 * Read-side data access for the leads domain. Plain module on purpose: these
 * functions run inside server pages/components and must never be registered
 * as RPC server actions (that only belongs to the "use server" mutation
 * modules). Authz scoping is enforced here exactly as it was in the action
 * modules — callers must not bypass it with client-supplied staff ids.
 */

/**
 * TERMINAL_LEAD_STATUSES as a SQL fragment for the raw count(*) filters below,
 * where drizzle operators can't reach — one source of truth (labels.ts) so an
 * enum change can't desync these queries.
 */
const terminalStatusesSql = sql.join(
  TERMINAL_LEAD_STATUSES.map((status) => sql`${status}`),
  sql`, `
);

export type LeadListRow = {
  id: string;
  name: string;
  defaultSource: string;
  createdAt: Date;
};

export type LeadRow = {
  id: string;
  listId: string;
  fullName: string;
  email: string;
  phone: string | null;
  source: string;
  sourceDetail: string | null;
  notes: string | null;
  status: string;
  ibId: string | null;
  ibEmail: string | null;
  assignedAgentId: string | null;
  assignedAgentEmail: string | null;
  assignedByStaffId: string | null;
  assignedByEmail: string | null;
  assignedAt: Date | null;
  nextFollowUpAt: Date | null;
  lastActivityAt: Date | null;
  investorId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listLeadListsForStaff(): Promise<LeadListRow[]> {
  const staff = await requireStaff();

  if (staff.role === "super_admin") {
    return db
      .select({
        id: leadLists.id,
        name: leadLists.name,
        defaultSource: leadLists.defaultSource,
        createdAt: leadLists.createdAt
      })
      .from(leadLists)
      .orderBy(asc(leadLists.name));
  }

  // Agent: lists containing own leads. IB: lists containing team leads.
  const scope =
    staff.role === "ib"
      ? eq(leads.ibId, staff.staff.id)
      : eq(leads.assignedAgentId, staff.staff.id);

  const assignedListIds = await db
    .selectDistinct({ listId: leads.listId })
    .from(leads)
    .where(scope);

  if (assignedListIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: leadLists.id,
      name: leadLists.name,
      defaultSource: leadLists.defaultSource,
      createdAt: leadLists.createdAt
    })
    .from(leadLists)
    .where(
      inArray(
        leadLists.id,
        assignedListIds.map((row) => row.listId)
      )
    )
    .orderBy(asc(leadLists.name));
}

export async function listLeadsForStaff(input?: {
  listId?: string;
  ibStaffId?: string;
}): Promise<LeadRow[]> {
  const staff = await requireStaff();
  const assignedAgent = alias(staffProfiles, "assigned_agent");
  const ib = alias(staffProfiles, "ib");
  const assignedBy = alias(staffProfiles, "assigned_by");

  const conditions = [];
  if (input?.listId) {
    conditions.push(eq(leads.listId, input.listId));
  }
  if (staff.role === "ib") {
    // An IB sees its unassigned queue plus every lead owned by its team.
    conditions.push(eq(leads.ibId, staff.staff.id));
  } else if (staff.role !== "super_admin") {
    conditions.push(eq(leads.assignedAgentId, staff.staff.id));
  } else if (input?.ibStaffId) {
    conditions.push(eq(leads.ibId, input.ibStaffId));
  }

  const query = db
    .select({
      id: leads.id,
      listId: leads.listId,
      fullName: leads.fullName,
      email: leads.email,
      phone: leads.phone,
      source: leads.source,
      sourceDetail: leads.sourceDetail,
      notes: leads.notes,
      status: leads.status,
      ibId: leads.ibId,
      ibEmail: ib.email,
      assignedAgentId: leads.assignedAgentId,
      assignedAgentEmail: assignedAgent.email,
      assignedByStaffId: leads.assignedByStaffId,
      assignedByEmail: assignedBy.email,
      assignedAt: leads.assignedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      lastActivityAt: leads.lastActivityAt,
      investorId: leads.investorId,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt
    })
    .from(leads)
    .leftJoin(assignedAgent, eq(leads.assignedAgentId, assignedAgent.id))
    .leftJoin(ib, eq(leads.ibId, ib.id))
    .leftJoin(assignedBy, eq(leads.assignedByStaffId, assignedBy.id));

  if (conditions.length === 0) {
    return query.orderBy(asc(leads.fullName));
  }

  return query
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(asc(leads.fullName));
}

/**
 * Targeted single-lead lookup for the lead detail page: same row shape and
 * role scoping as listLeadsForStaff, without selecting the staff member's
 * whole book. A lead outside the staff member's scope throws NOT_FOUND (not
 * FORBIDDEN) so the page 404s and its existence stays indistinguishable from
 * a nonexistent lead — no oracle.
 */
export async function getLeadForStaff(leadId: string): Promise<LeadRow> {
  const staff = await requireStaff();
  const assignedAgent = alias(staffProfiles, "assigned_agent");
  const ib = alias(staffProfiles, "ib");
  const assignedBy = alias(staffProfiles, "assigned_by");

  const [lead] = await db
    .select({
      id: leads.id,
      listId: leads.listId,
      fullName: leads.fullName,
      email: leads.email,
      phone: leads.phone,
      source: leads.source,
      sourceDetail: leads.sourceDetail,
      notes: leads.notes,
      status: leads.status,
      ibId: leads.ibId,
      ibEmail: ib.email,
      assignedAgentId: leads.assignedAgentId,
      assignedAgentEmail: assignedAgent.email,
      assignedByStaffId: leads.assignedByStaffId,
      assignedByEmail: assignedBy.email,
      assignedAt: leads.assignedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      lastActivityAt: leads.lastActivityAt,
      investorId: leads.investorId,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt
    })
    .from(leads)
    .leftJoin(assignedAgent, eq(leads.assignedAgentId, assignedAgent.id))
    .leftJoin(ib, eq(leads.ibId, ib.id))
    .leftJoin(assignedBy, eq(leads.assignedByStaffId, assignedBy.id))
    .where(eq(leads.id, leadId))
    .limit(1);

  if (
    !lead ||
    !leadVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      lead: { assignedAgentId: lead.assignedAgentId, ibId: lead.ibId }
    })
  ) {
    throw new Error("NOT_FOUND");
  }

  return lead;
}

export const LEADS_PAGE_SIZE = 25;

export type LeadSearchInput = {
  /** Case-insensitive substring matched against full name or email. */
  q?: string;
  /** Stage filter; unknown values are ignored. */
  status?: string;
  /** 1-based page; values < 1 clamp to 1. */
  page?: number;
  /** Restrict to one lead list (admin list page). */
  listId?: string;
  /**
   * "unassigned" = the IB queue (no agent yet); "assigned" = has an agent.
   * Defaults to both.
   */
  assignment?: "any" | "unassigned" | "assigned";
  /** Only stale leads: non-terminal and idle for over STALE_AFTER_DAYS. */
  stale?: boolean;
  /** Only leads with no assigned agent (dashboard deep-link). */
  unassigned?: boolean;
};

export type LeadSearchResult = {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Paginated, searchable lead list. Same role scoping as listLeadsForStaff:
 * super_admin sees all, an IB sees its queue + team, an agent sees its book.
 */
export async function searchLeadsForStaff(
  input?: LeadSearchInput
): Promise<LeadSearchResult> {
  const staff = await requireStaff();
  const assignedAgent = alias(staffProfiles, "assigned_agent");
  const ib = alias(staffProfiles, "ib");
  const assignedBy = alias(staffProfiles, "assigned_by");

  const conditions = [];
  if (staff.role === "ib") {
    // An IB sees its unassigned queue plus every lead owned by its team.
    conditions.push(eq(leads.ibId, staff.staff.id));
  } else if (staff.role !== "super_admin") {
    conditions.push(eq(leads.assignedAgentId, staff.staff.id));
  }

  if (input?.listId) {
    conditions.push(eq(leads.listId, input.listId));
  }

  const q = input?.q?.trim();
  if (q) {
    // Escape LIKE metacharacters so user input is matched literally.
    const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    conditions.push(or(ilike(leads.fullName, pattern), ilike(leads.email, pattern)));
  }

  if (input?.status && (LEAD_STATUS_VALUES as readonly string[]).includes(input.status)) {
    conditions.push(eq(leads.status, input.status as LeadStatus));
  }

  if (input?.assignment === "unassigned") {
    conditions.push(isNull(leads.assignedAgentId));
    // The IB queue mirrors every workload query: terminal stages never appear.
    conditions.push(notInArray(leads.status, [...TERMINAL_LEAD_STATUSES]));
  } else if (input?.assignment === "assigned") {
    conditions.push(isNotNull(leads.assignedAgentId));
  }

  if (input?.stale) {
    // Same semantics as isStaleLead: non-terminal, last touch over STALE_AFTER_DAYS ago.
    conditions.push(notInArray(leads.status, [...TERMINAL_LEAD_STATUSES]));
    conditions.push(sql`${leads.lastActivityAt} is not null`);
    conditions.push(
      lt(leads.lastActivityAt, new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000))
    );
  }

  if (input?.unassigned) {
    conditions.push(isNull(leads.assignedAgentId));
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  const pageSize = LEADS_PAGE_SIZE;
  const page = Math.max(1, Math.floor(input?.page ?? 1));

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(leads)
    .where(where);
  const total = Number(countRow?.total ?? 0);

  const rows = await db
    .select({
      id: leads.id,
      listId: leads.listId,
      fullName: leads.fullName,
      email: leads.email,
      phone: leads.phone,
      source: leads.source,
      sourceDetail: leads.sourceDetail,
      notes: leads.notes,
      status: leads.status,
      ibId: leads.ibId,
      ibEmail: ib.email,
      assignedAgentId: leads.assignedAgentId,
      assignedAgentEmail: assignedAgent.email,
      assignedByStaffId: leads.assignedByStaffId,
      assignedByEmail: assignedBy.email,
      assignedAt: leads.assignedAt,
      nextFollowUpAt: leads.nextFollowUpAt,
      lastActivityAt: leads.lastActivityAt,
      investorId: leads.investorId,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt
    })
    .from(leads)
    .leftJoin(assignedAgent, eq(leads.assignedAgentId, assignedAgent.id))
    .leftJoin(ib, eq(leads.ibId, ib.id))
    .leftJoin(assignedBy, eq(leads.assignedByStaffId, assignedBy.id))
    .where(where)
    // Secondary key keeps page boundaries stable when names collide.
    .orderBy(asc(leads.fullName), asc(leads.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total, page, pageSize };
}

/**
 * Scoped count of stale leads (non-terminal, idle for over STALE_AFTER_DAYS),
 * for section headers and the dashboard stale-leads widget. Accepts the same
 * assignment split as searchLeadsForStaff so each queue header gets an
 * accurate number.
 */
export async function countStaleLeadsForStaff(input?: {
  assignment?: "unassigned" | "assigned";
}): Promise<number> {
  const staff = await requireStaff();

  const conditions = [
    notInArray(leads.status, [...TERMINAL_LEAD_STATUSES]),
    sql`${leads.lastActivityAt} is not null`,
    lt(leads.lastActivityAt, new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000))
  ];

  if (staff.role === "ib") {
    conditions.push(eq(leads.ibId, staff.staff.id));
  } else if (staff.role !== "super_admin") {
    conditions.push(eq(leads.assignedAgentId, staff.staff.id));
  }

  if (input?.assignment === "unassigned") {
    conditions.push(isNull(leads.assignedAgentId));
  } else if (input?.assignment === "assigned") {
    conditions.push(isNotNull(leads.assignedAgentId));
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}

export type IbWorkloadRow = {
  id: string;
  email: string;
  queueCount: number;
  teamLeadCount: number;
  overdueCount: number;
};

export async function listIbsWithWorkload(): Promise<IbWorkloadRow[]> {
  await requireSuperAdmin();

  const rows = await db
    .select({
      id: staffProfiles.id,
      email: staffProfiles.email,
      queueCount: sql<number>`count(*) filter (where ${leads.id} is not null and ${leads.assignedAgentId} is null and ${leads.status} not in (${terminalStatusesSql}))`,
      teamLeadCount: sql<number>`count(*) filter (where ${leads.id} is not null and ${leads.status} not in (${terminalStatusesSql}))`,
      overdueCount: sql<number>`count(*) filter (where ${leads.nextFollowUpAt} is not null and ${leads.nextFollowUpAt} < now() and ${leads.status} not in (${terminalStatusesSql}))`
    })
    .from(staffProfiles)
    .leftJoin(leads, eq(leads.ibId, staffProfiles.id))
    .where(and(eq(staffProfiles.role, "ib"), sql`${staffProfiles.deactivatedAt} is null`))
    .groupBy(staffProfiles.id, staffProfiles.email)
    .orderBy(staffProfiles.email);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    queueCount: Number(row.queueCount),
    teamLeadCount: Number(row.teamLeadCount),
    overdueCount: Number(row.overdueCount)
  }));
}

export type AgentWorkloadRow = {
  id: string;
  email: string;
  ibId: string | null;
  ibEmail: string | null;
  activeLeadCount: number;
  overdueCount: number;
  lastActivityAt: Date | null;
};

export async function listAgentsWithWorkload(input?: {
  ibStaffId?: string;
}): Promise<AgentWorkloadRow[]> {
  const staff = await requireStaff();

  const rosterScope = agentRosterScopeForStaff({
    role: staff.role,
    staffId: staff.staff.id,
    requestedIbId: input?.ibStaffId
  });
  if (!rosterScope.allowed) throw new Error("FORBIDDEN");

  const agentLead = alias(leads, "agent_lead");
  const conditions = [eq(staffProfiles.role, "agent"), sql`${staffProfiles.deactivatedAt} is null`];
  if (rosterScope.ibId) conditions.push(eq(staffProfiles.ibId, rosterScope.ibId));

  const ib = alias(staffProfiles, "ib");
  const rows = await db
    .select({
      id: staffProfiles.id,
      email: staffProfiles.email,
      ibId: staffProfiles.ibId,
      ibEmail: ib.email,
      activeLeadCount: sql<number>`count(${agentLead.id}) filter (where ${agentLead.status} not in (${terminalStatusesSql}))`,
      overdueCount: sql<number>`count(${agentLead.id}) filter (where ${agentLead.nextFollowUpAt} is not null and ${agentLead.nextFollowUpAt} < now() and ${agentLead.status} not in (${terminalStatusesSql}))`,
      lastActivityAt: sql<Date | null>`max(${agentLead.lastActivityAt})`
    })
    .from(staffProfiles)
    .leftJoin(ib, eq(staffProfiles.ibId, ib.id))
    .leftJoin(agentLead, eq(agentLead.assignedAgentId, staffProfiles.id))
    .where(and(...conditions))
    .groupBy(staffProfiles.id, staffProfiles.email, staffProfiles.ibId, ib.email)
    .orderBy(staffProfiles.email);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    ibId: row.ibId,
    ibEmail: row.ibEmail,
    activeLeadCount: Number(row.activeLeadCount),
    overdueCount: Number(row.overdueCount),
    lastActivityAt: row.lastActivityAt
  }));
}

/** Ownership columns needed by the read-side visibility checks below. */
async function loadLeadForStaff(leadId: string) {
  const [lead] = await db
    .select({
      id: leads.id,
      listId: leads.listId,
      ibId: leads.ibId,
      assignedAgentId: leads.assignedAgentId,
      investorId: leads.investorId,
      status: leads.status
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  return lead ?? null;
}

export type LeadAssignmentHistoryRow = {
  id: string;
  action: string;
  actorEmail: string | null;
  fromIbEmail: string | null;
  toIbEmail: string | null;
  fromAgentEmail: string | null;
  toAgentEmail: string | null;
  note: string | null;
  createdAt: Date;
};

export async function getLeadAssignmentHistory(
  leadId: string
): Promise<LeadAssignmentHistoryRow[]> {
  const staff = await requireStaff();

  const lead = await loadLeadForStaff(leadId);
  if (!lead) throw new Error("NOT_FOUND");
  if (
    !leadVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      lead: { assignedAgentId: lead.assignedAgentId, ibId: lead.ibId }
    })
  ) {
    throw new Error("FORBIDDEN");
  }

  const actor = alias(staffProfiles, "actor");
  const fromIb = alias(staffProfiles, "from_ib");
  const toIb = alias(staffProfiles, "to_ib");
  const fromAgent = alias(staffProfiles, "from_agent");
  const toAgent = alias(staffProfiles, "to_agent");

  return db
    .select({
      id: leadAssignments.id,
      action: leadAssignments.action,
      actorEmail: actor.email,
      fromIbEmail: fromIb.email,
      toIbEmail: toIb.email,
      fromAgentEmail: fromAgent.email,
      toAgentEmail: toAgent.email,
      note: leadAssignments.note,
      createdAt: leadAssignments.createdAt
    })
    .from(leadAssignments)
    .leftJoin(actor, eq(leadAssignments.actorStaffId, actor.id))
    .leftJoin(fromIb, eq(leadAssignments.fromIbId, fromIb.id))
    .leftJoin(toIb, eq(leadAssignments.toIbId, toIb.id))
    .leftJoin(fromAgent, eq(leadAssignments.fromAgentId, fromAgent.id))
    .leftJoin(toAgent, eq(leadAssignments.toAgentId, toAgent.id))
    .where(eq(leadAssignments.leadId, leadId))
    .orderBy(desc(leadAssignments.createdAt));
}

export type LeadDashboardCounts = {
  awaitingAssignment: number;
  ibQueue: number;
  directToAgents: number;
  overdueFollowUps: number;
  unworked: number;
};

export async function getLeadDashboardCounts(): Promise<LeadDashboardCounts> {
  const staff = await requireStaff();

  const activeStatuses = sql`(${leads.status} not in (${terminalStatusesSql}))`;

  const scoped =
    staff.role === "super_admin"
      ? sql`true`
      : staff.role === "ib"
        ? eq(leads.ibId, staff.staff.id)
        : eq(leads.assignedAgentId, staff.staff.id);

  const [row] = await db
    .select({
      awaitingAssignment: sql<number>`count(*) filter (where ${leads.ibId} is null and ${leads.assignedAgentId} is null and ${activeStatuses})`,
      ibQueue: sql<number>`count(*) filter (where ${leads.ibId} is not null and ${leads.assignedAgentId} is null and ${activeStatuses})`,
      directToAgents: sql<number>`count(*) filter (where ${leads.assignedAgentId} is not null and ${activeStatuses})`,
      overdueFollowUps: sql<number>`count(*) filter (where ${leads.nextFollowUpAt} is not null and ${leads.nextFollowUpAt} < now() and ${activeStatuses})`,
      unworked: sql<number>`count(*) filter (where ${leads.lastActivityAt} is null and ${activeStatuses})`
    })
    .from(leads)
    .where(scoped);

  return {
    awaitingAssignment: Number(row?.awaitingAssignment ?? 0),
    ibQueue: Number(row?.ibQueue ?? 0),
    directToAgents: Number(row?.directToAgents ?? 0),
    overdueFollowUps: Number(row?.overdueFollowUps ?? 0),
    unworked: Number(row?.unworked ?? 0)
  };
}

export type AttemptRow = {
  id: string;
  leadId: string;
  agentId: string;
  agentEmail: string | null;
  calledAt: Date;
  outcome: LeadCallOutcome;
  notes: string | null;
  createdAt: Date;
};

export async function listCallAttemptsForLead(
  leadId: string
): Promise<AttemptRow[]> {
  const staff = await requireStaff();

  const lead = await loadLeadForStaff(leadId);
  if (!lead) {
    throw new Error("NOT_FOUND");
  }

  if (
    !leadVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      lead: { assignedAgentId: lead.assignedAgentId, ibId: lead.ibId }
    })
  ) {
    throw new Error("FORBIDDEN");
  }

  return db
    .select({
      id: leadCallAttempts.id,
      leadId: leadCallAttempts.leadId,
      agentId: leadCallAttempts.agentId,
      agentEmail: staffProfiles.email,
      calledAt: leadCallAttempts.calledAt,
      outcome: leadCallAttempts.outcome,
      notes: leadCallAttempts.notes,
      createdAt: leadCallAttempts.createdAt
    })
    .from(leadCallAttempts)
    .innerJoin(staffProfiles, eq(leadCallAttempts.agentId, staffProfiles.id))
    .where(eq(leadCallAttempts.leadId, lead.id))
    .orderBy(desc(leadCallAttempts.calledAt), desc(leadCallAttempts.createdAt));
}

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireStaff, requireSuperAdmin, type StaffContext } from "@/lib/auth/staff";
import { isActiveStaff } from "@/lib/auth/roles";
import {
  auditEvents,
  db,
  investors,
  leadAssignments,
  leads,
  staffProfiles
} from "@/lib/db";

export type LeadActionResult = { ok: true } | { ok: false; error: string };

export type ActorResult =
  | { ok: true; staff: StaffContext }
  | { ok: false; error: string };

/** Anything that can run queries: the global db handle or a transaction. */
export type DbExecutor = Pick<typeof db, "select" | "update" | "insert">;

export type RowLockOptions = {
  /**
   * Lock the selected row until the surrounding transaction commits. Assignment
   * mutations use this to serialize competing ownership changes and preserve
   * accurate from/to history.
   */
  forUpdate?: boolean;
};

export async function requireActor(): Promise<ActorResult> {
  try {
    const staff = await requireStaff();
    return { ok: true, staff };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }
}

export async function requireSuperActor(): Promise<ActorResult> {
  try {
    const staff = await requireSuperAdmin();
    return { ok: true, staff };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }
}

export type LeadOwnershipRow = {
  id: string;
  listId: string;
  ibId: string | null;
  assignedAgentId: string | null;
  investorId: string | null;
  status: "new" | "contacted" | "qualified" | "unqualified" | "duplicate" | "converted";
};

export async function loadLead(
  exec: DbExecutor,
  leadId: string,
  options: RowLockOptions = {}
): Promise<LeadOwnershipRow | null> {
  const query = exec
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
  const [lead] = options.forUpdate ? await query.for("update") : await query;
  return lead ?? null;
}

export async function loadIb(
  exec: DbExecutor,
  ibStaffId: string,
  options: RowLockOptions = {}
) {
  const query = exec
    .select({
      id: staffProfiles.id,
      email: staffProfiles.email,
      role: staffProfiles.role,
      deactivatedAt: staffProfiles.deactivatedAt
    })
    .from(staffProfiles)
    .where(eq(staffProfiles.id, ibStaffId))
    .limit(1);
  const [ib] = options.forUpdate ? await query.for("update") : await query;
  if (!ib || ib.role !== "ib" || !isActiveStaff(ib)) return null;
  return ib;
}

export async function loadAgent(
  exec: DbExecutor,
  agentStaffId: string,
  options: RowLockOptions = {}
) {
  const query = exec
    .select({
      id: staffProfiles.id,
      email: staffProfiles.email,
      role: staffProfiles.role,
      ibId: staffProfiles.ibId,
      deactivatedAt: staffProfiles.deactivatedAt
    })
    .from(staffProfiles)
    .where(eq(staffProfiles.id, agentStaffId))
    .limit(1);
  const [agent] = options.forUpdate ? await query.for("update") : await query;
  if (!agent || agent.role !== "agent" || !isActiveStaff(agent)) return null;
  return agent;
}

export function revalidateLead(listId?: string, leadId?: string) {
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  if (listId) revalidatePath(`/admin/leads/${listId}`);
  if (leadId) revalidatePath(`/admin/leads/lead/${leadId}`);
}

export async function writeAssignmentLog(
  exec: DbExecutor,
  input: {
    leadId: string;
    actorStaffId: string;
    actorUserId: string;
    action:
      | "assign_ib"
      | "assign_agent"
      | "reassign_ib"
      | "reassign_agent"
      | "remove_agent"
      | "remove_all"
      | "return_to_ib_queue";
    from: { ibId: string | null; agentId: string | null };
    to: { ibId: string | null; agentId: string | null };
    note?: string | null;
  }
) {
  await exec.insert(leadAssignments).values({
    leadId: input.leadId,
    actorStaffId: input.actorStaffId,
    action: input.action,
    fromIbId: input.from.ibId,
    toIbId: input.to.ibId,
    fromAgentId: input.from.agentId,
    toAgentId: input.to.agentId,
    note: input.note ?? null
  });

  await exec.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    action: `lead.${input.action}`,
    entityType: "lead",
    entityId: input.leadId,
    payload: {
      fromIbId: input.from.ibId,
      toIbId: input.to.ibId,
      fromAgentId: input.from.agentId,
      toAgentId: input.to.agentId,
      note: input.note ?? null
    }
  });
}

/**
 * Keep the converted investor in sync with the owning lead.
 * Original attribution is written once and never overwritten.
 */
export async function syncLinkedInvestor(
  exec: DbExecutor,
  input: {
    investorId: string;
    ibId: string | null;
    agentId: string | null;
    leadId: string;
    forUpdate?: boolean;
  }
) {
  const query = exec
    .select({
      id: investors.id,
      assignedAgentId: investors.assignedAgentId,
      ibId: investors.ibId,
      originalAgentId: investors.originalAgentId,
      originalIbId: investors.originalIbId
    })
    .from(investors)
    .where(eq(investors.id, input.investorId))
    .limit(1);
  const [investor] = input.forUpdate ? await query.for("update") : await query;

  if (!investor) return;

  const setOriginalAgent = !investor.originalAgentId && input.agentId;
  const setOriginalIb = !investor.originalIbId && input.ibId;

  if (
    investor.assignedAgentId === input.agentId &&
    investor.ibId === input.ibId &&
    !setOriginalAgent &&
    !setOriginalIb
  ) {
    return;
  }

  await exec
    .update(investors)
    .set({
      assignedAgentId: input.agentId,
      ibId: input.ibId,
      ...(setOriginalAgent ? { originalAgentId: input.agentId } : {}),
      ...(setOriginalIb ? { originalIbId: input.ibId } : {}),
      updatedAt: new Date()
    })
    .where(eq(investors.id, investor.id));

  revalidatePath("/admin/investors");
}

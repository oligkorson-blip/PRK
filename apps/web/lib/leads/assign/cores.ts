import { eq } from "drizzle-orm";
import type { StaffContext } from "@/lib/auth/staff";
import { leads } from "@/lib/db";
import {
  loadAgent,
  loadIb,
  loadLead,
  revalidateLead,
  syncLinkedInvestor,
  writeAssignmentLog,
  type DbExecutor,
  type LeadActionResult
} from "./shared";

export type AssignLeadToIbInput = {
  leadId: string;
  ibStaffId: string;
  note?: string;
};

/** Route 1 core — super_admin only; callers must authorize before invoking. */
export async function assignLeadToIbCore(
  exec: DbExecutor,
  staff: StaffContext,
  input: AssignLeadToIbInput
): Promise<LeadActionResult> {
  const lead = await loadLead(exec, input.leadId, { forUpdate: true });
  if (!lead) return { ok: false, error: "Lead not found." };

  const ib = await loadIb(exec, input.ibStaffId, { forUpdate: true });
  if (!ib) return { ok: false, error: "IB not found." };

  const from = { ibId: lead.ibId, agentId: lead.assignedAgentId };
  const action = from.ibId === null ? "assign_ib" : "reassign_ib";

  await exec
    .update(leads)
    .set({
      ibId: ib.id,
      assignedAgentId: null,
      assignedByStaffId: staff.staff.id,
      assignedAt: new Date(),
      lastActivityAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(leads.id, lead.id));

  await writeAssignmentLog(exec, {
    leadId: lead.id,
    actorStaffId: staff.staff.id,
    actorUserId: staff.user.id,
    action,
    from,
    to: { ibId: ib.id, agentId: null },
    note: input.note
  });

  if (lead.investorId) {
    await syncLinkedInvestor(exec, {
      investorId: lead.investorId,
      ibId: ib.id,
      agentId: null,
      leadId: lead.id,
      forUpdate: true
    });
  }

  revalidateLead(lead.listId, lead.id);
  return { ok: true };
}

export type AssignLeadToAgentInput = {
  leadId: string;
  agentStaffId: string;
  note?: string;
};

/** Route 2 core — super_admin or the owning IB; callers must authorize first. */
export async function assignLeadToAgentCore(
  exec: DbExecutor,
  staff: StaffContext,
  input: AssignLeadToAgentInput
): Promise<LeadActionResult> {
  if (staff.role !== "super_admin" && staff.role !== "ib") {
    return { ok: false, error: "Forbidden." };
  }

  const lead = await loadLead(exec, input.leadId, { forUpdate: true });
  if (!lead) return { ok: false, error: "Lead not found." };

  const agent = await loadAgent(exec, input.agentStaffId, { forUpdate: true });
  if (!agent) return { ok: false, error: "Agent not found." };
  if (!agent.ibId) {
    return { ok: false, error: "That agent has no parent IB. Assign the agent to an IB first." };
  }

  if (staff.role === "ib") {
    // An IB may only assign its own leads, and only to agents on its own team.
    if (lead.ibId !== staff.staff.id) {
      return { ok: false, error: "This lead is not in your team's book." };
    }
    if (agent.ibId !== staff.staff.id) {
      return { ok: false, error: "You can only assign leads to agents on your own team." };
    }
  }

  const from = { ibId: lead.ibId, agentId: lead.assignedAgentId };
  const action = from.agentId === null ? "assign_agent" : "reassign_agent";

  await exec
    .update(leads)
    .set({
      ibId: agent.ibId,
      assignedAgentId: agent.id,
      assignedByStaffId: staff.staff.id,
      assignedAt: new Date(),
      lastActivityAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(leads.id, lead.id));

  await writeAssignmentLog(exec, {
    leadId: lead.id,
    actorStaffId: staff.staff.id,
    actorUserId: staff.user.id,
    action,
    from,
    to: { ibId: agent.ibId, agentId: agent.id },
    note: input.note
  });

  if (lead.investorId) {
    await syncLinkedInvestor(exec, {
      investorId: lead.investorId,
      ibId: agent.ibId,
      agentId: agent.id,
      leadId: lead.id,
      forUpdate: true
    });
  }

  revalidateLead(lead.listId, lead.id);
  return { ok: true };
}

export type RemoveLeadAgentInput = {
  leadId: string;
  note?: string;
};

/** Core for removing the agent while keeping the lead under the same IB. */
export async function removeLeadAgentCore(
  exec: DbExecutor,
  staff: StaffContext,
  input: RemoveLeadAgentInput
): Promise<LeadActionResult> {
  if (staff.role !== "super_admin" && staff.role !== "ib") {
    return { ok: false, error: "Forbidden." };
  }

  const lead = await loadLead(exec, input.leadId, { forUpdate: true });
  if (!lead) return { ok: false, error: "Lead not found." };
  if (!lead.assignedAgentId) return { ok: false, error: "This lead has no assigned agent." };

  if (staff.role === "ib" && lead.ibId !== staff.staff.id) {
    return { ok: false, error: "This lead is not in your team's book." };
  }

  const from = { ibId: lead.ibId, agentId: lead.assignedAgentId };

  await exec
    .update(leads)
    .set({
      assignedAgentId: null,
      assignedByStaffId: staff.staff.id,
      assignedAt: new Date(),
      lastActivityAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(leads.id, lead.id));

  await writeAssignmentLog(exec, {
    leadId: lead.id,
    actorStaffId: staff.staff.id,
    actorUserId: staff.user.id,
    action: "return_to_ib_queue",
    from,
    to: { ibId: lead.ibId, agentId: null },
    note: input.note
  });

  if (lead.investorId) {
    await syncLinkedInvestor(exec, {
      investorId: lead.investorId,
      ibId: lead.ibId,
      agentId: null,
      leadId: lead.id,
      forUpdate: true
    });
  }

  revalidateLead(lead.listId, lead.id);
  return { ok: true };
}

/** Core for removing both the IB and the agent assignment — super_admin only. */
export async function removeLeadAssignmentCore(
  exec: DbExecutor,
  staff: StaffContext,
  input: RemoveLeadAgentInput
): Promise<LeadActionResult> {
  const lead = await loadLead(exec, input.leadId, { forUpdate: true });
  if (!lead) return { ok: false, error: "Lead not found." };
  if (!lead.ibId && !lead.assignedAgentId) {
    return { ok: false, error: "This lead is already unassigned." };
  }

  const from = { ibId: lead.ibId, agentId: lead.assignedAgentId };

  await exec
    .update(leads)
    .set({
      ibId: null,
      assignedAgentId: null,
      assignedByStaffId: staff.staff.id,
      assignedAt: new Date(),
      lastActivityAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(leads.id, lead.id));

  await writeAssignmentLog(exec, {
    leadId: lead.id,
    actorStaffId: staff.staff.id,
    actorUserId: staff.user.id,
    action: "remove_all",
    from,
    to: { ibId: null, agentId: null },
    note: input.note
  });

  if (lead.investorId) {
    await syncLinkedInvestor(exec, {
      investorId: lead.investorId,
      ibId: null,
      agentId: null,
      leadId: lead.id,
      forUpdate: true
    });
  }

  revalidateLead(lead.listId, lead.id);
  return { ok: true };
}

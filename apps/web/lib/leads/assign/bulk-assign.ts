"use server";

import { asc, eq } from "drizzle-orm";
import { db, leadLists, leads } from "@/lib/db";
import { requireSuperActor, revalidateLead, type LeadActionResult } from "./shared";
import {
  assignLeadToAgentCore,
  assignLeadToIbCore,
  removeLeadAgentCore,
  removeLeadAssignmentCore
} from "./cores";

/** Marker used to roll back a bulk assignment while keeping the error message. */
class BulkAssignRollback extends Error {}

/**
 * Super Admin bulk variant — applies one assignment decision to every lead in
 * a list. The whole batch runs in a single transaction: any failure rolls
 * back all per-lead changes.
 */
export async function assignAllLeadsInList(input: {
  listId: string;
  agentStaffId?: string | null;
  ibStaffId?: string | null;
  unassignAll?: boolean;
}): Promise<LeadActionResult> {
  const actor = await requireSuperActor();
  if (!actor.ok) return actor;
  const { staff } = actor;

  let listId: string | null = null;
  let leadIds: string[] = [];
  let result: LeadActionResult;

  result = await db.transaction(async (tx) => {
    // Take the list and its lead snapshot under the same transaction. The
    // row locks make the batch boundary explicit and keep concurrent bulk
    // operations in a deterministic lead-id order.
    const listQuery = tx
      .select({ id: leadLists.id })
      .from(leadLists)
      .where(eq(leadLists.id, input.listId))
      .limit(1);
    const [list] = await listQuery.for("update");

    if (!list) {
      return { ok: false, error: "Lead list not found." };
    }

    listId = list.id;

    const listLeads = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.listId, list.id))
      .orderBy(asc(leads.id))
      .for("update");

    leadIds = listLeads.map((lead) => lead.id);

    let failure: string | null = null;
    try {
      for (const lead of listLeads) {
        let actionResult: LeadActionResult;
        if (input.unassignAll) {
          actionResult = await removeLeadAssignmentCore(tx, staff, { leadId: lead.id });
          if (!actionResult.ok && actionResult.error === "This lead is already unassigned.") {
            continue;
          }
        } else if (input.agentStaffId) {
          actionResult = await assignLeadToAgentCore(tx, staff, {
            leadId: lead.id,
            agentStaffId: input.agentStaffId
          });
        } else if (input.ibStaffId) {
          actionResult = await assignLeadToIbCore(tx, staff, {
            leadId: lead.id,
            ibStaffId: input.ibStaffId
          });
        } else {
          actionResult = await removeLeadAgentCore(tx, staff, { leadId: lead.id });
          if (!actionResult.ok && actionResult.error === "This lead has no assigned agent.") {
            continue;
          }
        }

        if (!actionResult.ok) {
          failure = actionResult.error;
          throw new BulkAssignRollback();
        }
      }
    } catch (error) {
      if (!(error instanceof BulkAssignRollback)) throw error;
    }

    if (failure) {
      return { ok: false, error: failure };
    }
    return { ok: true };
  });

  if (listId) {
    // Match the refresh behavior of the single-lead actions, including the
    // rolled-back error path so the UI never shows stale ownership.
    for (const leadId of leadIds) {
      revalidateLead(listId, leadId);
    }
  }

  return result;
}

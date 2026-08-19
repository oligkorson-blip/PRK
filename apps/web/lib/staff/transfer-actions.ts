"use server";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { isActiveStaff } from "@/lib/auth/roles";
import {
  auditEvents,
  db,
  investors,
  leadAssignments,
  leads,
  staffProfiles
} from "@/lib/db";
import { type StaffActionResult } from "./shared";

/** Move an agent to another IB. Existing leads do NOT move with the agent. */
export async function transferAgentToIb(input: {
  agentStaffId: string;
  toIbStaffId: string;
  leadStrategy: "keep_with_original_ib" | "move_with_agent";
}): Promise<StaffActionResult> {
  let actor: { userId: string; staffId: string };
  try {
    const staff = await requireSuperAdmin();
    actor = { userId: staff.user.id, staffId: staff.staff.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }

  let result: StaffActionResult;
  try {
    result = await db.transaction(async (tx) => {
      // Lock the agent's current leads before locking staff rows. This matches
      // the lead-first ordering used by assignment and deactivation flows.
      const initiallyOwnedLeads = await tx
        .select({
          id: leads.id,
          ibId: leads.ibId,
          assignedAgentId: leads.assignedAgentId
        })
        .from(leads)
        .where(eq(leads.assignedAgentId, input.agentStaffId))
        .orderBy(asc(leads.id))
        .for("update");

      const profiles = await tx
        .select({
          id: staffProfiles.id,
          email: staffProfiles.email,
          role: staffProfiles.role,
          ibId: staffProfiles.ibId,
          deactivatedAt: staffProfiles.deactivatedAt
        })
        .from(staffProfiles)
        .where(
          inArray(staffProfiles.id, [
            input.agentStaffId,
            input.toIbStaffId
          ])
        )
        .orderBy(asc(staffProfiles.id))
        .for("update");

      const agent = profiles.find((row) => row.id === input.agentStaffId);
      if (!agent || agent.role !== "agent" || !isActiveStaff(agent)) {
        return { ok: false, error: "Agent not found." };
      }

      const ib = profiles.find((row) => row.id === input.toIbStaffId);
      if (!ib || ib.role !== "ib" || !isActiveStaff(ib)) {
        return { ok: false, error: "IB not found." };
      }

      if (!agent.ibId) {
        return { ok: false, error: "Agent has no parent IB." };
      }

      if (agent.ibId === ib.id) {
        return { ok: false, error: "That agent is already on this IB's team." };
      }

      const fromIbId = agent.ibId;

      // Refresh after both locked rows are validated so the mutation never
      // relies on a stale page snapshot.
      const refreshedOwnedLeads = await tx
        .select({
          id: leads.id,
          ibId: leads.ibId,
          assignedAgentId: leads.assignedAgentId
        })
        .from(leads)
        .where(eq(leads.assignedAgentId, agent.id))
        .orderBy(asc(leads.id));

      const ownedLeads = Array.from(
        new Map(
          [...initiallyOwnedLeads, ...refreshedOwnedLeads].map((lead) => [
            lead.id,
            lead
          ])
        ).values()
      ).sort((left, right) => left.id.localeCompare(right.id));

      const now = new Date();
      const updatedAgent = await tx
        .update(staffProfiles)
        .set({ ibId: ib.id, updatedAt: now })
        .where(
          and(
            eq(staffProfiles.id, agent.id),
            eq(staffProfiles.ibId, fromIbId)
          )
        )
        .returning({ id: staffProfiles.id });

      if (updatedAgent.length !== 1) {
        throw new Error("STAFF_OWNERSHIP_CHANGED");
      }

      for (const lead of ownedLeads) {
        const leadIbCondition = lead.ibId
          ? eq(leads.ibId, lead.ibId)
          : isNull(leads.ibId);

        if (input.leadStrategy === "move_with_agent") {
          const updated = await tx
            .update(leads)
            .set({ ibId: ib.id, lastActivityAt: now, updatedAt: now })
            .where(
              and(
                eq(leads.id, lead.id),
                eq(leads.assignedAgentId, agent.id),
                leadIbCondition
              )
            )
            .returning({ id: leads.id });

          if (updated.length !== 1) {
            throw new Error("STAFF_OWNERSHIP_CHANGED");
          }

          await tx.insert(leadAssignments).values({
            leadId: lead.id,
            actorStaffId: actor.staffId,
            action: "reassign_ib",
            fromIbId: lead.ibId,
            toIbId: ib.id,
            fromAgentId: agent.id,
            toAgentId: agent.id,
            note: "Agent transferred between IBs, leads moved with agent"
          });
        } else {
          const updated = await tx
            .update(leads)
            .set({ assignedAgentId: null, lastActivityAt: now, updatedAt: now })
            .where(
              and(
                eq(leads.id, lead.id),
                eq(leads.assignedAgentId, agent.id),
                leadIbCondition
              )
            )
            .returning({ id: leads.id });

          if (updated.length !== 1) {
            throw new Error("STAFF_OWNERSHIP_CHANGED");
          }

          await tx.insert(leadAssignments).values({
            leadId: lead.id,
            actorStaffId: actor.staffId,
            action: "return_to_ib_queue",
            fromIbId: lead.ibId,
            toIbId: lead.ibId,
            fromAgentId: agent.id,
            toAgentId: null,
            note: "Agent transferred to another IB, lead kept with original IB"
          });
        }
      }

      if (input.leadStrategy === "move_with_agent") {
        await tx
          .update(investors)
          .set({ ibId: ib.id, updatedAt: now })
          .where(eq(investors.assignedAgentId, agent.id));
      } else {
        await tx
          .update(investors)
          .set({ assignedAgentId: null, updatedAt: now })
          .where(eq(investors.assignedAgentId, agent.id));
      }

      await tx.insert(auditEvents).values({
        actorUserId: actor.userId,
        action: "staff.agent_transferred",
        entityType: "staff_profile",
        entityId: agent.id,
        payload: {
          email: agent.email,
          fromIbStaffId: fromIbId,
          toIbStaffId: ib.id,
          leadStrategy: input.leadStrategy,
          leadCount: ownedLeads.length
        }
      });

      return { ok: true };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STAFF_OWNERSHIP_CHANGED") {
      return {
        ok: false,
        error: "Ownership changed while the agent was being transferred. Refresh and try again."
      };
    }
    throw error;
  }

  if (!result.ok) return result;

  revalidatePath("/admin/staff");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/investors");
  return result;
}

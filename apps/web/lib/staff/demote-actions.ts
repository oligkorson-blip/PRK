"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { effectiveStaffRole, isActiveStaff } from "@/lib/auth/roles";
import {
  auditEvents,
  db,
  investors,
  leadAssignments,
  leads,
  staffProfiles
} from "@/lib/db";
import { type StaffActionResult } from "./shared";

export async function demoteAgent(input: {
  staffId: string;
  leadStrategy: "return_to_ib_queue" | "unassign_all" | { reassignToAgentId: string };
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
    // Lock currently owned leads in a stable order before locking staff rows.
    // Lead assignment already uses lead-first ordering, so concurrent work is
    // serialized without taking a stale ownership snapshot.
    const initiallyOwnedLeads = await tx
      .select({
        id: leads.id,
        ibId: leads.ibId,
        assignedAgentId: leads.assignedAgentId
      })
      .from(leads)
      .where(eq(leads.assignedAgentId, input.staffId))
      .orderBy(asc(leads.id))
      .for("update");

    const reassignToAgentId =
      typeof input.leadStrategy === "object"
        ? input.leadStrategy.reassignToAgentId
        : null;
    const profileIds = reassignToAgentId
      ? [input.staffId, reassignToAgentId]
      : [input.staffId];

    // Recheck the source and target while holding row locks. The UI read is
    // only advisory, because a target can be deactivated after the page loads.
    const profiles = await tx
      .select({
        id: staffProfiles.id,
        email: staffProfiles.email,
        role: staffProfiles.role,
        ibId: staffProfiles.ibId,
        deactivatedAt: staffProfiles.deactivatedAt
      })
      .from(staffProfiles)
      .where(inArray(staffProfiles.id, profileIds))
      .orderBy(asc(staffProfiles.id))
      .for("update");

    const profile = profiles.find((row) => row.id === input.staffId);
    if (!profile) {
      return { ok: false, error: "Staff profile not found." };
    }

    if (profile.id === actor.staffId) {
      return { ok: false, error: "You cannot remove your own staff access." };
    }

    if (profile.deactivatedAt) {
      return { ok: false, error: "That staff member is already deactivated." };
    }

    // Evaluate the effective role: a super admin removed from SUPER_ADMIN_EMAILS
    // no longer counts as one and can be deactivated here.
    const effectiveRole = effectiveStaffRole({ email: profile.email, dbRole: profile.role });
    if (effectiveRole === "super_admin") {
      return { ok: false, error: "Super admins cannot be demoted here." };
    }
    if (effectiveRole === "ib") {
      return { ok: false, error: "Use the IB demotion flow for IBs." };
    }

    let reassignTarget: { id: string; ibId: string | null } | null = null;
    if (reassignToAgentId) {
      const target = profiles.find((row) => row.id === reassignToAgentId);
      if (!target || target.role !== "agent" || !isActiveStaff(target)) {
        return { ok: false, error: "Reassignment target agent not found." };
      }
      if (target.id === profile.id) {
        return { ok: false, error: "Cannot reassign leads to the agent being removed." };
      }
      // Agents always have an ibId by construction, so compare unconditionally:
      // a null profile.ibId means corrupt data and must not silently skip the check.
      if (target.ibId !== profile.ibId) {
        return { ok: false, error: "Leads can only be reassigned to an agent under the same IB." };
      }
      if (!target.ibId) {
        return {
          ok: false,
          error: "Reassignment target agent has no parent IB. Assign the agent to an IB first."
        };
      }
      reassignTarget = target;
    }

    // A concurrent assignment may have committed after the first locked read
    // but before the source profile lock. Refresh without waiting on an
    // assignment that is itself waiting for the source profile; it will be
    // rejected once it reaches its locked agent check.
    const refreshedOwnedLeads = await tx
      .select({
        id: leads.id,
        ibId: leads.ibId,
        assignedAgentId: leads.assignedAgentId
      })
      .from(leads)
      .where(eq(leads.assignedAgentId, profile.id))
      .orderBy(asc(leads.id));

    const ownedLeads = Array.from(
      new Map(
        [...initiallyOwnedLeads, ...refreshedOwnedLeads].map((lead) => [lead.id, lead])
      ).values()
    ).sort((left, right) => left.id.localeCompare(right.id));

    const now = new Date();

    for (const lead of ownedLeads) {
      let updated;
      if (reassignTarget) {
        updated = await tx
          .update(leads)
          .set({
            assignedAgentId: reassignTarget.id,
            ibId: reassignTarget.ibId,
            lastActivityAt: now,
            updatedAt: now
          })
          .where(and(eq(leads.id, lead.id), eq(leads.assignedAgentId, profile.id)))
          .returning({ id: leads.id });

        if (updated.length !== 1) {
          throw new Error("STAFF_OWNERSHIP_CHANGED");
        }

        await tx.insert(leadAssignments).values({
          leadId: lead.id,
          actorStaffId: actor.staffId,
          action: "reassign_agent",
          fromIbId: lead.ibId,
          toIbId: reassignTarget.ibId,
          fromAgentId: profile.id,
          toAgentId: reassignTarget.id,
          note: "Agent deactivated, leads reassigned"
        });
      } else if (input.leadStrategy === "return_to_ib_queue") {
        updated = await tx
          .update(leads)
          .set({ assignedAgentId: null, lastActivityAt: now, updatedAt: now })
          .where(and(eq(leads.id, lead.id), eq(leads.assignedAgentId, profile.id)))
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
          fromAgentId: profile.id,
          toAgentId: null,
          note: "Agent deactivated, leads returned to IB queue"
        });
      } else {
        updated = await tx
          .update(leads)
          .set({
            assignedAgentId: null,
            ibId: null,
            lastActivityAt: now,
            updatedAt: now
          })
          .where(and(eq(leads.id, lead.id), eq(leads.assignedAgentId, profile.id)))
          .returning({ id: leads.id });

        if (updated.length !== 1) {
          throw new Error("STAFF_OWNERSHIP_CHANGED");
        }

        await tx.insert(leadAssignments).values({
          leadId: lead.id,
          actorStaffId: actor.staffId,
          action: "remove_all",
          fromIbId: lead.ibId,
          toIbId: null,
          fromAgentId: profile.id,
          toAgentId: null,
          note: "Agent deactivated, lead fully unassigned"
        });
      }
    }

    if (reassignTarget) {
      await tx
        .update(investors)
        .set({
          assignedAgentId: reassignTarget.id,
          ibId: reassignTarget.ibId,
          updatedAt: now
        })
        .where(eq(investors.assignedAgentId, profile.id));
    } else if (input.leadStrategy === "return_to_ib_queue") {
      await tx
        .update(investors)
        .set({ assignedAgentId: null, updatedAt: now })
        .where(eq(investors.assignedAgentId, profile.id));
    } else {
      await tx
        .update(investors)
        .set({ assignedAgentId: null, ibId: null, updatedAt: now })
        .where(eq(investors.assignedAgentId, profile.id));
    }

    // Soft-delete: the row stays so assignment history and FK references remain intact.
    await tx
      .update(staffProfiles)
      .set({ deactivatedAt: now, updatedAt: now })
      .where(eq(staffProfiles.id, profile.id));

    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "staff.demoted",
      entityType: "staff_profile",
      entityId: profile.id,
      payload: {
        email: profile.email,
        leadStrategy:
          typeof input.leadStrategy === "object" ? "reassign" : input.leadStrategy,
        leadCount: ownedLeads.length
      }
    });

      return { ok: true };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STAFF_OWNERSHIP_CHANGED") {
      return {
        ok: false,
        error: "Ownership changed while staff access was being removed. Refresh and try again."
      };
    }
    throw error;
  }

  if (result.ok) {
    revalidatePath("/admin/staff");
    revalidatePath("/admin/investors");
    revalidatePath("/admin/leads");
  }
  return result;
}

export async function demoteIb(input: {
  staffId: string;
  teamStrategy: { reassignTeamToIbId: string };
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
      // Lock the current team leads in the same order used by assignment flows.
      const initiallyOwnedLeads = await tx
        .select({
          id: leads.id,
          ibId: leads.ibId,
          assignedAgentId: leads.assignedAgentId
        })
        .from(leads)
        .where(eq(leads.ibId, input.staffId))
        .orderBy(asc(leads.id))
        .for("update");

      // Lock current team agents before locking either IB row. Agent transfers
      // use the same agent-first ordering, preventing stale team membership.
      await tx
        .select({ id: staffProfiles.id })
        .from(staffProfiles)
        .where(
          and(
            eq(staffProfiles.ibId, input.staffId),
            eq(staffProfiles.role, "agent")
          )
        )
        .orderBy(asc(staffProfiles.id))
        .for("update");

      const profileIds = [input.staffId, input.teamStrategy.reassignTeamToIbId];
      const profiles = await tx
        .select({
          id: staffProfiles.id,
          email: staffProfiles.email,
          role: staffProfiles.role,
          deactivatedAt: staffProfiles.deactivatedAt
        })
        .from(staffProfiles)
        .where(inArray(staffProfiles.id, profileIds))
        .orderBy(asc(staffProfiles.id))
        .for("update");

      const profile = profiles.find((row) => row.id === input.staffId);
      if (!profile) {
        return { ok: false, error: "Staff profile not found." };
      }

      if (profile.id === actor.staffId) {
        return { ok: false, error: "You cannot remove your own staff access." };
      }

      if (profile.deactivatedAt) {
        return { ok: false, error: "That IB is already deactivated." };
      }

      const effectiveRole = effectiveStaffRole({
        email: profile.email,
        dbRole: profile.role
      });
      if (effectiveRole === "super_admin") {
        return { ok: false, error: "Super admins cannot be demoted here." };
      }
      if (effectiveRole !== "ib") {
        return { ok: false, error: "That staff member is not an IB." };
      }

      const target = profiles.find(
        (row) => row.id === input.teamStrategy.reassignTeamToIbId
      );
      if (!target || target.role !== "ib" || !isActiveStaff(target)) {
        return { ok: false, error: "Reassignment target IB not found." };
      }
      if (target.id === profile.id) {
        return {
          ok: false,
          error: "Cannot reassign the team to the IB being removed."
        };
      }

      // Refresh after the staff locks so leads committed just before the
      // source IB lock are included in the same atomic move.
      const refreshedOwnedLeads = await tx
        .select({
          id: leads.id,
          ibId: leads.ibId,
          assignedAgentId: leads.assignedAgentId
        })
        .from(leads)
        .where(eq(leads.ibId, profile.id))
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
      for (const lead of ownedLeads) {
        const updated = await tx
          .update(leads)
          .set({
            ibId: target.id,
            lastActivityAt: now,
            updatedAt: now
          })
          .where(
            and(eq(leads.id, lead.id), eq(leads.ibId, profile.id))
          )
          .returning({ id: leads.id });

        if (updated.length !== 1) {
          throw new Error("STAFF_OWNERSHIP_CHANGED");
        }

        await tx.insert(leadAssignments).values({
          leadId: lead.id,
          actorStaffId: actor.staffId,
          action: "reassign_ib",
          fromIbId: profile.id,
          toIbId: target.id,
          fromAgentId: lead.assignedAgentId,
          toAgentId: lead.assignedAgentId,
          note: "IB deactivated, team reassigned"
        });
      }

      await tx
        .update(staffProfiles)
        .set({ ibId: target.id, updatedAt: now })
        .where(
          and(
            eq(staffProfiles.ibId, profile.id),
            eq(staffProfiles.role, "agent")
          )
        );

      await tx
        .update(investors)
        .set({ ibId: target.id, updatedAt: now })
        .where(eq(investors.ibId, profile.id));

      await tx
        .update(staffProfiles)
        .set({ deactivatedAt: now, updatedAt: now })
        .where(eq(staffProfiles.id, profile.id));

      await tx.insert(auditEvents).values({
        actorUserId: actor.userId,
        action: "staff.ib_demoted",
        entityType: "staff_profile",
        entityId: profile.id,
        payload: {
          email: profile.email,
          teamReassignedToIbId: target.id,
          leadCount: ownedLeads.length
        }
      });

      return { ok: true };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STAFF_OWNERSHIP_CHANGED") {
      return {
        ok: false,
        error: "Ownership changed while the IB team was being moved. Refresh and try again."
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

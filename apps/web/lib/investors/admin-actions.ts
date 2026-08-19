"use server";

import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { isActiveStaff } from "@/lib/auth/roles";
import {
  auditEvents,
  db,
  investors,
  staffProfiles
} from "@/lib/db";
import { revalidatePath } from "next/cache";

export type AssignInvestorResult = { ok: true } | { ok: false; error: string };

export async function assignInvestor(input: {
  investorId: string;
  agentStaffId: string | null;
}): Promise<AssignInvestorResult> {
  let actorUserId: string;
  try {
    const staff = await requireSuperAdmin();
    actorUserId = staff.user.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }

  const result: AssignInvestorResult = await db.transaction(async (tx) => {
    // Serialize reassignments on the investor row so every audit event records
    // the assignment it actually replaced and original attribution stays
    // write-once under concurrent requests.
    const [current] = await tx
      .select({
        id: investors.id,
        assignedAgentId: investors.assignedAgentId,
        ibId: investors.ibId,
        originalAgentId: investors.originalAgentId,
        originalIbId: investors.originalIbId
      })
      .from(investors)
      .where(eq(investors.id, input.investorId))
      .limit(1)
      .for("update");

    if (!current) {
      return { ok: false, error: "Investor not found." };
    }

    let nextAgentId: string | null = null;
    let nextIbId: string | null = null;

    if (input.agentStaffId !== null) {
      // Hold a shared lock while validating the target. A concurrent staff
      // deactivation cannot commit between this check and the assignment.
      const [agent] = await tx
        .select({
          id: staffProfiles.id,
          role: staffProfiles.role,
          ibId: staffProfiles.ibId,
          deactivatedAt: staffProfiles.deactivatedAt
        })
        .from(staffProfiles)
        .where(eq(staffProfiles.id, input.agentStaffId))
        .limit(1)
        .for("share");

      if (!agent || agent.role !== "agent" || !isActiveStaff(agent)) {
        return { ok: false, error: "Agent not found." };
      }
      if (!agent.ibId) {
        return {
          ok: false,
          error: "That agent has no parent IB. Assign the agent to an IB first."
        };
      }

      nextAgentId = agent.id;
      nextIbId = agent.ibId;
    }

    await tx
      .update(investors)
      .set({
        assignedAgentId: nextAgentId,
        ibId: nextIbId,
        ...(!current.originalAgentId && nextAgentId
          ? { originalAgentId: nextAgentId }
          : {}),
        ...(!current.originalIbId && nextIbId ? { originalIbId: nextIbId } : {}),
        updatedAt: new Date()
      })
      .where(eq(investors.id, input.investorId));

    await tx.insert(auditEvents).values({
      actorUserId,
      action: "investor.assigned",
      entityType: "investor",
      entityId: input.investorId,
      payload: {
        fromAgentStaffId: current.assignedAgentId,
        fromIbStaffId: current.ibId,
        toAgentStaffId: nextAgentId,
        toIbStaffId: nextIbId
      }
    });

    return { ok: true };
  });

  if (result.ok) {
    revalidatePath("/admin/investors");
  }
  return result;
}


/** Super-admin-only per-investor access control for the location-pool lane. */
export async function setInvestorPoolAccess(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const investorId = String(formData.get("investorId") ?? "");
  const enabled = formData.get("enabled") === "true";
  if (!investorId) throw new Error("INVESTOR_REQUIRED");

  const changed = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: investors.id, poolInvestmentsEnabled: investors.poolInvestmentsEnabled })
      .from(investors)
      .where(eq(investors.id, investorId))
      .limit(1)
      .for("update");

    if (!current) throw new Error("INVESTOR_NOT_FOUND");
    if (current.poolInvestmentsEnabled === enabled) return false;

    await tx
      .update(investors)
      .set({ poolInvestmentsEnabled: enabled, updatedAt: new Date() })
      .where(eq(investors.id, investorId));

    await tx.insert(auditEvents).values({
      actorUserId: admin.user.id,
      action: "investor.pool_access_changed",
      entityType: "investor",
      entityId: investorId,
      payload: { from: current.poolInvestmentsEnabled, to: enabled }
    });
    return true;
  });

  if (changed) {
    revalidatePath("/admin/investors");
    revalidatePath(`/admin/investors/${investorId}`);
    revalidatePath("/opportunities", "layout");
  }
}

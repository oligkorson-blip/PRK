import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, staffProfiles } from "@/lib/db";
import { effectiveStaffRole, isSuperAdminEmail, type StaffRole } from "./roles";
import { getSessionUser } from "./session";

export type StaffContext = {
  user: { id: string; email: string };
  staff: { id: string; role: StaffRole; ibId: string | null };
  role: StaffRole;
};

export function investorVisibleToStaff(input: {
  role: StaffRole;
  staffId: string;
  investor: { assignedAgentId: string | null; ibId: string | null };
}): boolean {
  if (input.role === "super_admin") return true;
  if (input.role === "ib") return input.investor.ibId === input.staffId;
  return input.investor.assignedAgentId === input.staffId;
}

export type AgentRosterScope = {
  allowed: boolean;
  ibId: string | null;
};

/**
 * Defines the staff roster boundary used by agent selectors and workload
 * views. Super admins may optionally filter by IB, IBs are locked to their
 * own team, and agents cannot enumerate the roster.
 */
export function agentRosterScopeForStaff(input: {
  role: StaffRole;
  staffId: string;
  requestedIbId?: string | null;
}): AgentRosterScope {
  if (input.role === "agent") {
    return { allowed: false, ibId: null };
  }

  if (input.role === "ib") {
    return { allowed: true, ibId: input.staffId };
  }

  return { allowed: true, ibId: input.requestedIbId ?? null };
}

// React cache(): one staff-context resolution per request (layout + page +
// SiteHeaderHost all ask for it). The super-admin upsert is idempotent, so
// memoizing within a request is safe.
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  let profile:
    | { id: string; role: StaffRole; ibId: string | null; deactivatedAt: Date | null }
    | undefined;

  if (isSuperAdminEmail(user.email)) {
    const [upserted] = await db
      .insert(staffProfiles)
      .values({
        authUserId: user.id,
        email: user.email,
        role: "super_admin"
      })
      .onConflictDoUpdate({
        target: staffProfiles.authUserId,
        set: {
          email: user.email,
          role: "super_admin",
          deactivatedAt: null,
          updatedAt: new Date()
        }
      })
      .returning({
        id: staffProfiles.id,
        role: staffProfiles.role,
        ibId: staffProfiles.ibId,
        deactivatedAt: staffProfiles.deactivatedAt
      });
    profile = upserted;
  } else {
    const [existing] = await db
      .select({
        id: staffProfiles.id,
        role: staffProfiles.role,
        ibId: staffProfiles.ibId,
        deactivatedAt: staffProfiles.deactivatedAt
      })
      .from(staffProfiles)
      .where(eq(staffProfiles.authUserId, user.id))
      .limit(1);
    profile = existing;
  }

  if (!profile) return null;
  // Deactivated staff lose all access.
  if (profile.deactivatedAt) return null;

  const role = effectiveStaffRole({ email: user.email, dbRole: profile.role });
  if (!role) return null;

  return {
    user: { id: user.id, email: user.email },
    staff: { id: profile.id, role, ibId: profile.ibId },
    role
  };
});

export async function requireStaff(): Promise<StaffContext> {
  const ctx = await getStaffContext();
  if (!ctx) throw new Error("FORBIDDEN");
  return ctx;
}

export async function requireSuperAdmin(): Promise<StaffContext> {
  const ctx = await requireStaff();
  if (ctx.role !== "super_admin") throw new Error("FORBIDDEN");
  return ctx;
}

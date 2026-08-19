"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { effectiveStaffRole, isSuperAdminEmail } from "@/lib/auth/roles";
import { auditEvents, db, staffProfiles } from "@/lib/db";
import {
  findAuthUserByEmail,
  loadIbOrError,
  normalizeEmail,
  type StaffActionResult
} from "./shared";

export async function promoteToIb(input: {
  email: string;
}): Promise<StaffActionResult> {
  let actorUserId: string;
  try {
    const staff = await requireSuperAdmin();
    actorUserId = staff.user.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }

  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (isSuperAdminEmail(email)) {
    return { ok: false, error: "That email is a super admin and cannot be promoted to IB." };
  }

  const authUser = await findAuthUserByEmail(email);
  if (!authUser) {
    return {
      ok: false,
      error: "No signed-up user with that email. They must create an account first."
    };
  }

  const [existing] = await db
    .select({ id: staffProfiles.id, role: staffProfiles.role })
    .from(staffProfiles)
    .where(eq(staffProfiles.authUserId, authUser.id))
    .limit(1);

  if (
    existing &&
    effectiveStaffRole({ email: authUser.email, dbRole: existing.role }) === "super_admin"
  ) {
    return { ok: false, error: "That user is already a super admin." };
  }
  if (existing?.role === "agent") {
    return {
      ok: false,
      error: "That user is an agent. Reassign their leads and demote them first."
    };
  }

  try {
    await db.transaction(async (tx) => {
      const [profile] = await tx
        .insert(staffProfiles)
        .values({
          authUserId: authUser.id,
          email: authUser.email,
          role: "ib"
        })
        .onConflictDoUpdate({
          target: staffProfiles.authUserId,
          set: {
            email: authUser.email,
            role: "ib",
            ibId: null,
            deactivatedAt: null,
            updatedAt: new Date()
          }
        })
        .returning({ id: staffProfiles.id });

      if (!profile) {
        throw new Error("Staff profile upsert returned no row.");
      }

      await tx.insert(auditEvents).values({
        actorUserId,
        action: "staff.promoted",
        entityType: "staff_profile",
        entityId: profile.id,
        payload: { email: authUser.email, role: "ib" }
      });
    });
  } catch {
    return { ok: false, error: "Could not promote staff. Try again." };
  }

  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function promoteToAgent(input: {
  email: string;
  ibStaffId: string;
}): Promise<StaffActionResult> {
  let actorUserId: string;
  try {
    const staff = await requireSuperAdmin();
    actorUserId = staff.user.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }

  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (isSuperAdminEmail(email)) {
    return { ok: false, error: "That email is a super admin and cannot be promoted to agent." };
  }

  // Every agent must belong to exactly one IB.
  const ib = await loadIbOrError(input.ibStaffId);
  if (!ib.ok) return ib;

  const authUser = await findAuthUserByEmail(email);
  if (!authUser) {
    return {
      ok: false,
      error: "No signed-up user with that email. They must create an account first."
    };
  }

  const [existing] = await db
    .select({ id: staffProfiles.id, role: staffProfiles.role })
    .from(staffProfiles)
    .where(eq(staffProfiles.authUserId, authUser.id))
    .limit(1);

  if (
    existing &&
    effectiveStaffRole({ email: authUser.email, dbRole: existing.role }) === "super_admin"
  ) {
    return { ok: false, error: "That user is already a super admin." };
  }
  if (existing?.role === "ib") {
    return { ok: false, error: "That user is an IB. Demote them from IB first." };
  }

  try {
    await db.transaction(async (tx) => {
      const [profile] = await tx
        .insert(staffProfiles)
        .values({
          authUserId: authUser.id,
          email: authUser.email,
          role: "agent",
          ibId: ib.id
        })
        .onConflictDoUpdate({
          target: staffProfiles.authUserId,
          set: {
            email: authUser.email,
            role: "agent",
            ibId: ib.id,
            deactivatedAt: null,
            updatedAt: new Date()
          }
        })
        .returning({ id: staffProfiles.id });

      if (!profile) {
        throw new Error("Staff profile upsert returned no row.");
      }

      await tx.insert(auditEvents).values({
        actorUserId,
        action: "staff.promoted",
        entityType: "staff_profile",
        entityId: profile.id,
        payload: { email: authUser.email, role: "agent", ibStaffId: ib.id }
      });
    });
  } catch {
    return { ok: false, error: "Could not promote staff. Try again." };
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin/investors");
  return { ok: true };
}

"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { auditEvents, db, session, staffProfiles, twoFactor, user } from "@/lib/db";
import type { StaffActionResult } from "./shared";

/**
 * Break-glass recovery: clears the target's TOTP secret/backup codes, flips the
 * user flag back off, and revokes every live session so a compromised device
 * cannot linger. The actor must be a super-admin with two-factor enabled on
 * their own account (no fresh MFA challenge, this stays a break-glass flow),
 * and may not reset their own account, so a second MFA-authenticated
 * super-admin is always involved.
 */
export async function resetStaffTwoFactor(input: {
  staffId: string;
}): Promise<StaffActionResult> {
  let actor: { userId: string; staffId: string };
  try {
    const staff = await requireSuperAdmin();
    actor = { userId: staff.user.id, staffId: staff.staff.id };
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const result = await db.transaction(async (tx): Promise<StaffActionResult> => {
    // Verify the actor's MFA state under lock so it cannot change between the
    // break-glass authorization check and the reset writes.
    const [actorUser] = await tx
      .select({ twoFactorEnabled: user.twoFactorEnabled })
      .from(user)
      .where(eq(user.id, actor.userId))
      .for("update");
    if (!actorUser?.twoFactorEnabled) {
      return {
        ok: false,
        error: "Enable two-factor on your own account before resetting another staff member's."
      };
    }

    // Lock the staff profile so its auth-user link cannot change while the
    // reset is clearing credentials and sessions for that account.
    const [target] = await tx
      .select({
        id: staffProfiles.id,
        authUserId: staffProfiles.authUserId,
        email: staffProfiles.email
      })
      .from(staffProfiles)
      .where(eq(staffProfiles.id, input.staffId))
      .for("update");

    if (!target) return { ok: false, error: "Staff profile not found." };
    if (target.id === actor.staffId) {
      return { ok: false, error: "Another super-admin must reset your two-factor access." };
    }

    await tx.delete(twoFactor).where(eq(twoFactor.userId, target.authUserId));
    await tx
      .update(user)
      .set({ twoFactorEnabled: false, updatedAt: new Date() })
      .where(eq(user.id, target.authUserId));
    await tx.delete(session).where(eq(session.userId, target.authUserId));
    await tx.insert(auditEvents).values({
      actorUserId: actor.userId,
      action: "staff.two_factor_reset",
      entityType: "staff_profile",
      entityId: target.id,
      payload: { email: target.email }
    });

    return { ok: true };
  });

  if (!result.ok) return result;

  revalidatePath(`/admin/staff/${input.staffId}`);
  revalidatePath("/admin/staff");
  return result;
}

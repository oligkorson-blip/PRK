"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { auditEvents, db, investors, session, twoFactor, user } from "@/lib/db";
import type { StaffActionResult } from "@/lib/staff/shared";

/**
 * Break-glass recovery for investors locked out of two-factor: clears the
 * target's TOTP secret/backup codes, flips the user flag back off, and
 * revokes every live session so a compromised device cannot linger. The actor
 * must be a super admin with two-factor enabled and may not reset their own
 * account through an investor link.
 */
export async function resetInvestorTwoFactor(input: {
  investorId: string;
}): Promise<StaffActionResult> {
  let actorUserId: string;
  try {
    const staff = await requireSuperAdmin();
    actorUserId = staff.user.id;
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const result = await db.transaction(async (tx): Promise<StaffActionResult> => {
    // Verify the actor's MFA state under lock so it cannot change between the
    // break-glass authorization check and the reset writes.
    const [actorUser] = await tx
      .select({ twoFactorEnabled: user.twoFactorEnabled })
      .from(user)
      .where(eq(user.id, actorUserId))
      .for("update");
    if (!actorUser?.twoFactorEnabled) {
      return {
        ok: false,
        error: "Enable two-factor on your own account before resetting an investor's."
      };
    }

    // Lock the investor link so authUserId cannot be replaced while the reset
    // is clearing credentials and sessions for that account.
    const [target] = await tx
      .select({
        id: investors.id,
        authUserId: investors.authUserId,
        email: investors.email
      })
      .from(investors)
      .where(eq(investors.id, input.investorId))
      .for("update");

    if (!target) return { ok: false, error: "Investor not found." };
    if (!target.authUserId) {
      return { ok: false, error: "Investor has no sign-in account yet." };
    }
    if (target.authUserId === actorUserId) {
      return { ok: false, error: "Another super-admin must reset your two-factor access." };
    }

    await tx.delete(twoFactor).where(eq(twoFactor.userId, target.authUserId));
    await tx
      .update(user)
      .set({ twoFactorEnabled: false, updatedAt: new Date() })
      .where(eq(user.id, target.authUserId));
    await tx.delete(session).where(eq(session.userId, target.authUserId));
    await tx.insert(auditEvents).values({
      actorUserId,
      action: "investor.two_factor_reset",
      entityType: "investor",
      entityId: target.id,
      payload: { email: target.email }
    });

    return { ok: true };
  });

  if (!result.ok) return result;

  revalidatePath(`/admin/investors/${input.investorId}`);
  revalidatePath("/admin/investors");
  return result;
}

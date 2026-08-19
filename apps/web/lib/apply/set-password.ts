"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { account, auditEvents, db, inviteTokens, investors, session } from "@/lib/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { hashInviteToken } from "@/lib/apply/invite-token";
import { INVITE_NOT_READY_ERROR, PASSWORD_UPDATE_ERROR } from "@/lib/auth/connection-copy";

const INVALID_INVITE_ERROR = "Invite expired or invalid. Ask your advisor for a new invite.";

export type SetPasswordResult = { ok: true; email: string } | { ok: false; error: string };

export async function setPasswordWithInvite(input: {
  token: string;
  password: string;
}): Promise<SetPasswordResult> {
  const password = input.password;
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: "Password must be at least " + PASSWORD_MIN_LENGTH + " characters." };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: "Password must be at most " + PASSWORD_MAX_LENGTH + " characters." };
  }

  const tokenHash = hashInviteToken(input.token);
  const preflightNow = new Date();
  const [candidateInvite] = await db
    .select({
      id: inviteTokens.id,
      investorId: inviteTokens.investorId
    })
    .from(inviteTokens)
    .where(
      and(
        eq(inviteTokens.tokenHash, tokenHash),
        isNull(inviteTokens.usedAt),
        gt(inviteTokens.expiresAt, preflightNow)
      )
    )
    .limit(1);

  if (!candidateInvite) {
    return { ok: false, error: INVALID_INVITE_ERROR };
  }

  const [candidateInvestor] = await db
    .select({ authUserId: investors.authUserId })
    .from(investors)
    .where(eq(investors.id, candidateInvite.investorId))
    .limit(1);

  if (!candidateInvestor?.authUserId) {
    return { ok: false, error: INVITE_NOT_READY_ERROR };
  }

  const hashed = await hashPassword(password);
  const activation = await db.transaction(async (tx) => {
    // Password activation and invite creation both lock the investor first,
    // then the invite row. Keeping one lock order prevents two invite paths
    // from deadlocking while one path consumes and the other regenerates.
    const [investor] = await tx
      .select({
        id: investors.id,
        authUserId: investors.authUserId,
        email: investors.email
      })
      .from(investors)
      .where(eq(investors.id, candidateInvite.investorId))
      .limit(1)
      .for("update");

    if (!investor?.authUserId) {
      return { ok: false as const, error: INVITE_NOT_READY_ERROR };
    }

    const now = new Date();
    const [invite] = await tx
      .select()
      .from(inviteTokens)
      .where(
        and(
          eq(inviteTokens.id, candidateInvite.id),
          eq(inviteTokens.tokenHash, tokenHash),
          isNull(inviteTokens.usedAt),
          gt(inviteTokens.expiresAt, now)
        )
      )
      .limit(1)
      .for("update");

    if (!invite) {
      return { ok: false as const, error: INVALID_INVITE_ERROR };
    }

    // The isNull guard makes activation single-use: an invite for an account
    // that already completed password setup no longer rotates the credential,
    // so a leaked or stale invite link is not a takeover primitive.
    const updated = await tx
      .update(account)
      .set({ password: hashed, passwordSetAt: now, updatedAt: now })
      .where(
        and(
          eq(account.userId, investor.authUserId),
          eq(account.providerId, "credential"),
          isNull(account.passwordSetAt)
        )
      )
      .returning({ id: account.id });

    if (updated.length === 0) {
      // Zero rows means either the guard rejected an activated account or the
      // credential row is missing, check which before picking the error.
      const [existing] = await tx
        .select({ passwordSetAt: account.passwordSetAt })
        .from(account)
        .where(
          and(eq(account.userId, investor.authUserId), eq(account.providerId, "credential"))
        )
        .limit(1);
      if (existing?.passwordSetAt) {
        return {
          ok: false as const,
          error: "This account is already activated. Sign in or use forgot password to reset it."
        };
      }
      return { ok: false as const, error: PASSWORD_UPDATE_ERROR };
    }

    // Password, session revocation, invite consumption, and audit visibility
    // are one activation operation. Any failure rolls the entire sequence back.
    await tx.delete(session).where(eq(session.userId, investor.authUserId));

    await tx
      .update(inviteTokens)
      .set({ usedAt: now })
      .where(and(eq(inviteTokens.id, invite.id), isNull(inviteTokens.usedAt)));

    await tx.insert(auditEvents).values({
      actorUserId: investor.authUserId,
      action: "investor.password_set",
      entityType: "investor",
      entityId: investor.id,
      payload: { inviteTokenId: invite.id }
    });

    return { ok: true as const, email: investor.email };
  });

  return activation;
}

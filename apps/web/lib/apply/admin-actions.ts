"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/db/errors";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { requireStaff, requireSuperAdmin, investorVisibleToStaff } from "@/lib/auth/staff";
import {
  account,
  auditEvents,
  db,
  investorApplications,
  investors,
  inviteTokens,
  user
} from "@/lib/db";
import { generateInviteToken, inviteExpiresAt } from "@/lib/apply/invite-token";
import { sendTransactionalEmail } from "@/lib/email/send";
import { validateOpsRejectNote } from "@/lib/ops/reject-note";

function revalidateInvestorAdmin(investorId: string) {
  revalidatePath("/admin/investors");
  revalidatePath(`/admin/investors/${investorId}`);
}

export type InviteResult =
  | { ok: true; inviteUrl: string; emailSent: boolean }
  | { ok: false; error: string };

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** Satisfied by both `db` and a transaction handle. */
type WriteTx = Pick<typeof db, "select" | "insert" | "update">;


async function insertCredentialAccount(tx: WriteTx, userId: string): Promise<void> {
  const now = new Date();
  const tempPassword = randomBytes(24).toString("base64url");
  const hashed = await hashPassword(tempPassword);

  await tx.insert(account).values({
    id: randomBytes(16).toString("hex"),
    accountId: userId,
    providerId: "credential",
    issuer: "local:credential",
    userId,
    password: hashed,
    createdAt: now,
    updatedAt: now
  });
}

async function createAuthUser(email: string, name: string, tx: WriteTx): Promise<string> {
  const id = randomBytes(16).toString("hex");
  const now = new Date();

  await tx.insert(user).values({
    id,
    name: name || email,
    email,
    emailVerified: false,
    createdAt: now,
    updatedAt: now
  });

  await insertCredentialAccount(tx, id);

  return id;
}

/**
 * An orphan is a Better Auth user no investor references — left over when an
 * approve attempt failed before the link write (only possible from before the
 * flow was transactional). Returns its id so a retry can adopt it.
 */
async function findUnlinkedAuthUserId(email: string): Promise<string | null> {
  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!existing) return null;
  const [linked] = await db
    .select({ id: investors.id })
    .from(investors)
    .where(eq(investors.authUserId, existing.id))
    .limit(1);
  return linked ? null : existing.id;
}

async function linkAuthUserAndApprove(
  tx: WriteTx,
  input: { investorId: string; applicationId: string; authUserId: string; now: Date }
): Promise<void> {
  await tx
    .update(investors)
    .set({
      authUserId: input.authUserId,
      accountStatus: "active",
      updatedAt: input.now
    })
    .where(eq(investors.id, input.investorId));

  await tx
    .update(investorApplications)
    .set({ status: "approved", updatedAt: input.now })
    .where(eq(investorApplications.id, input.applicationId));
}

export async function approveAndInvite(investorId: string): Promise<InviteResult> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const [investor] = await db.select().from(investors).where(eq(investors.id, investorId)).limit(1);
  if (!investor) return { ok: false, error: "Investor not found." };
  if (!investorVisibleToStaff({ role: staff.role, staffId: staff.staff.id, investor: { assignedAgentId: investor.assignedAgentId, ibId: investor.ibId } })) {
    return { ok: false, error: "You do not have access to this investor." };
  }
  if (investor.accountStatus === "suspended") {
    return { ok: false, error: "Investor is suspended." };
  }

  const [application] = await db
    .select()
    .from(investorApplications)
    .where(eq(investorApplications.investorId, investorId))
    .orderBy(desc(investorApplications.createdAt))
    .limit(1);

  if (!application) return { ok: false, error: "No application found." };
  if (application.status === "approved" && investor.authUserId) {
    return regenerateInvite(investorId);
  }
  // Only pending-like applications can be approved; "approved" without a linked
  // auth user falls through as the recovery path for earlier partial failures.
  if (application.status === "rejected") {
    return { ok: false, error: `Application is already ${application.status}.` };
  }

  const now = new Date();
  try {
    // Auth user, investor link and application approval commit atomically, so a
    // mid-flow failure can no longer orphan a Better Auth user.
    await db.transaction(async (tx) => {
      const authUserId =
        investor.authUserId ??
        (await createAuthUser(investor.email, investor.fullName || investor.email, tx));
      await linkAuthUserAndApprove(tx, { investorId, applicationId: application.id, authUserId, now });
    });
  } catch (error) {
    // Retry after a legacy partial failure: the duplicate email belongs to an
    // unlinked orphan user — adopt it instead of surfacing the pg error.
    const orphanId =
      !investor.authUserId && isUniqueViolation(error)
        ? await findUnlinkedAuthUserId(investor.email)
        : null;
    if (!orphanId) {
      console.error("[apply:approveAndInvite]", error);
      return { ok: false, error: "Could not approve the application. Please try again." };
    }
    try {
      await db.transaction(async (tx) => {
        // Orphans from the old non-transactional flow may lack a credential
        // account row; backfill it so the invite can actually be used.
        const [cred] = await tx
          .select({ id: account.id })
          .from(account)
          .where(and(eq(account.userId, orphanId), eq(account.providerId, "credential")))
          .limit(1);
        if (!cred) {
          try {
            // Savepoint, so a lost race doesn't abort the link writes below:
            // concurrent approvals can both pass the check above, and the
            // loser's 23505 just means the winner created the account.
            await tx.transaction(async (sp) => {
              await insertCredentialAccount(sp, orphanId);
            });
          } catch (insertError) {
            if (!isUniqueViolation(insertError)) throw insertError;
          }
        }
        await linkAuthUserAndApprove(tx, {
          investorId,
          applicationId: application.id,
          authUserId: orphanId,
          now
        });
      });
    } catch (retryError) {
      console.error("[apply:approveAndInvite]", retryError);
      return { ok: false, error: "Could not approve the application. Please try again." };
    }
  }

  return createInviteForInvestor(investorId, staff.user.id);
}

/**
 * Re-issue an invite for an investor who already has a linked auth account.
 * setPasswordWithInvite overwrites the credential on that account with no
 * investor confirmation, so a regenerated invite URL is an account-takeover
 * primitive — super admins only, matching retractDocument. Initial invites
 * for never-activated investors still go through approveAndInvite, which any
 * staff role can run.
 */
export async function regenerateInvite(investorId: string): Promise<InviteResult> {
  let staff;
  try {
    staff = await requireSuperAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }
  const [investor] = await db.select().from(investors).where(eq(investors.id, investorId)).limit(1);
  if (!investor?.authUserId) {
    return { ok: false, error: "Approve & invite first." };
  }
  if (!investorVisibleToStaff({ role: staff.role, staffId: staff.staff.id, investor: { assignedAgentId: investor.assignedAgentId, ibId: investor.ibId } })) {
    return { ok: false, error: "You do not have access to this investor." };
  }
  return createInviteForInvestor(investorId, staff.user.id);
}

async function createInviteForInvestor(investorId: string, actorUserId: string): Promise<InviteResult> {
  const { token, tokenHash } = generateInviteToken();
  const expiresAt = inviteExpiresAt(72);

  // Invalidate + insert atomically so concurrent regenerations can't leave two live tokens.
  try {
    await db.transaction(async (tx) => {
      // Lock the investor before touching invite rows. Password activation uses
      // the same order, so concurrent invite paths cannot leave two live tokens
      // or deadlock while one path consumes and the other regenerates.
      const [investor] = await tx
        .select({ id: investors.id })
        .from(investors)
        .where(eq(investors.id, investorId))
        .limit(1)
        .for("update");

      if (!investor) throw new Error("Investor not found.");

      await tx
        .update(inviteTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(inviteTokens.investorId, investorId), isNull(inviteTokens.usedAt)));
      await tx.insert(inviteTokens).values({
        investorId,
        tokenHash,
        expiresAt,
        createdBy: actorUserId
      });
      await tx.insert(auditEvents).values({
        actorUserId,
        action: "investor.invited",
        entityType: "investor",
        entityId: investorId,
        payload: { expiresAt: expiresAt.toISOString() }
      });
    });
  } catch (error) {
    console.error("[apply:createInvite]", error);
    return { ok: false, error: "Could not create the invite. Please try again." };
  }

  const inviteUrl = `${appOrigin()}/set-password?token=${token}`;
  // investors.last_invite_url is deprecated/unused — never persist raw invite URLs (see INVITE_SECURITY_NOTE).

  const [investor] = await db.select().from(investors).where(eq(investors.id, investorId)).limit(1);

  let emailSent = false;
  if (investor) {
    try {
      const mail = await sendTransactionalEmail({
        to: investor.email,
        subject: "You're approved — set your Parkwise password",
        text: `Good news: your Parkwise application was approved. Set your password to open your investor portal (this link expires in 72 hours):\n\n${inviteUrl}\n\n— The Parkwise team\n\nCapital at risk.`
      });
      emailSent = mail.sent === true;
    } catch (error) {
      console.error("[email:invite]", error);
      emailSent = false;
    }
  }

  revalidateInvestorAdmin(investorId);
  return { ok: true, inviteUrl, emailSent };
}

export async function markApplicationContacted(
  investorId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const result = await db.transaction(async (tx) => {
    // Lock assignment scope and the latest application so reassignment or a
    // competing transition cannot race authorization and status validation.
    const [investor] = await tx
      .select({
        assignedAgentId: investors.assignedAgentId,
        ibId: investors.ibId
      })
      .from(investors)
      .where(eq(investors.id, investorId))
      .for("update");

    if (!investor) return { ok: false as const, error: "Investor not found." };
    if (
      !investorVisibleToStaff({
        role: staff.role,
        staffId: staff.staff.id,
        investor: {
          assignedAgentId: investor.assignedAgentId,
          ibId: investor.ibId
        }
      })
    ) {
      return { ok: false as const, error: "You do not have access to this investor." };
    }

    const [application] = await tx
      .select({
        id: investorApplications.id,
        status: investorApplications.status
      })
      .from(investorApplications)
      .where(eq(investorApplications.investorId, investorId))
      .orderBy(desc(investorApplications.createdAt))
      .limit(1)
      .for("update");

    if (!application) return { ok: false as const, error: "No application found." };
    if (application.status !== "submitted" && application.status !== "contacted") {
      return {
        ok: false as const,
        error: `Application is already ${application.status}.`
      };
    }

    await tx
      .update(investorApplications)
      .set({ status: "contacted", updatedAt: new Date() })
      .where(eq(investorApplications.id, application.id));

    await tx.insert(auditEvents).values({
      actorUserId: staff.user.id,
      action: "application.contacted",
      entityType: "investor",
      entityId: investorId,
      payload: { applicationId: application.id }
    });

    return { ok: true as const };
  });

  if (!result.ok) return result;

  revalidateInvestorAdmin(investorId);
  return result;
}

export async function rejectApplication(
  investorId: string,
  opsNote?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const parsed = validateOpsRejectNote(opsNote);
  if (!parsed.ok) return parsed;
  const note = parsed.note;

  const result = await db.transaction(async (tx) => {
    // Use the same locked assignment and application state for authorization,
    // rejection, and audit so the terminal transition cannot be overwritten.
    const [investor] = await tx
      .select({
        assignedAgentId: investors.assignedAgentId,
        ibId: investors.ibId
      })
      .from(investors)
      .where(eq(investors.id, investorId))
      .for("update");

    if (!investor) return { ok: false as const, error: "Investor not found." };
    if (
      !investorVisibleToStaff({
        role: staff.role,
        staffId: staff.staff.id,
        investor: {
          assignedAgentId: investor.assignedAgentId,
          ibId: investor.ibId
        }
      })
    ) {
      return { ok: false as const, error: "You do not have access to this investor." };
    }

    const [application] = await tx
      .select({
        id: investorApplications.id,
        status: investorApplications.status
      })
      .from(investorApplications)
      .where(eq(investorApplications.investorId, investorId))
      .orderBy(desc(investorApplications.createdAt))
      .limit(1)
      .for("update");

    if (!application) return { ok: false as const, error: "No application found." };
    if (application.status !== "submitted" && application.status !== "contacted") {
      return {
        ok: false as const,
        error: `Application is already ${application.status}.`
      };
    }

    const now = new Date();
    await tx
      .update(investorApplications)
      .set({ status: "rejected", opsNote: note, updatedAt: now })
      .where(eq(investorApplications.id, application.id));

    await tx.insert(auditEvents).values({
      actorUserId: staff.user.id,
      action: "application.rejected",
      entityType: "investor",
      entityId: investorId,
      payload: { applicationId: application.id, opsNote: note }
    });

    return { ok: true as const };
  });

  if (!result.ok) return result;

  revalidateInvestorAdmin(investorId);
  return result;
}

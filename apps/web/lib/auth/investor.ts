import { cache } from "react";
import { isUniqueViolation } from "@/lib/db/errors";
import { and, eq, isNull, sql } from "drizzle-orm";
import { auditEvents, db, investors, leads } from "@/lib/db";
import { linkLeadOnInvestorCreate } from "@/lib/leads/link";
import { requireSessionUser } from "./session";
import { requireStaff } from "./staff";

async function findExistingInvestor(authUserId: string) {
  const [investor] = await db
    .select()
    .from(investors)
    .where(eq(investors.authUserId, authUserId))
    .limit(1);
  return investor ?? null;
}

/**
 * Read-only lookup: no insert, audit event, or lead linking.
 * React cache(): memoized per request, keyed by authUserId.
 */
export const getExistingInvestor = cache(findExistingInvestor);

type InvestorRow = NonNullable<Awaited<ReturnType<typeof getExistingInvestor>>>;

/**
 * Claim the unowned investor row created by /apply when the applicant later
 * signs in. The email preflight avoids an extra transaction for ordinary new
 * users; the row is locked and rechecked before the auth id is attached.
 */
async function claimUnclaimedInvestorByEmail(user: {
  id: string;
  email: string;
}): Promise<InvestorRow | null> {
  const email = user.email.toLowerCase();
  const [candidate] = await db
    .select()
    .from(investors)
    .where(
      and(
        sql`lower(${investors.email}) = ${email}`,
        isNull(investors.authUserId)
      )
    )
    .limit(1);

  if (!candidate) return null;

  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(investors)
      .where(eq(investors.id, candidate.id))
      .limit(1)
      .for("update");

    if (
      !locked ||
      locked.authUserId ||
      locked.email.toLowerCase() !== email
    ) {
      return null;
    }

    const [claimed] = await tx
      .update(investors)
      .set({
        authUserId: user.id,
        updatedAt: new Date()
      })
      .where(
        and(eq(investors.id, locked.id), isNull(investors.authUserId))
      )
      .returning();

    if (!claimed) return null;

    await tx.insert(auditEvents).values({
      actorUserId: user.id,
      action: "investor.claimed_on_signin",
      entityType: "investor",
      entityId: claimed.id,
      payload: { email: user.email }
    });

    return claimed;
  });
}

/**
 * Link any matching unlinked lead, and fold the attribution the guarded update
 * actually applied back into the returned row (the row itself may predate the
 * link, so its own assignedAgentId can be stale).
 */
async function linkLeadAndMerge(investor: InvestorRow, userId: string) {
  // Lead linking updates the lead, the investor attribution, and its audit
  // event as one unit. The lead-first helper order remains compatible with
  // assignment transactions that also synchronize linked investors.
  const linked = await db.transaction(async (tx) =>
    linkLeadOnInvestorCreate(tx, investor, userId)
  );
  if (linked.assignedAgentId) {
    return { ...investor, assignedAgentId: linked.assignedAgentId };
  }
  return investor;
}

// React cache(): one ensure per request — the portal layout and page share the
// memoized result instead of each re-running the lookup/link logic.
export const ensureInvestor = cache(async () => {
  const user = await requireSessionUser();

  const existing = await getExistingInvestor(user.id);

  if (existing) {
    const [alreadyLinked] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.investorId, existing.id))
      .limit(1);

    if (!alreadyLinked) {
      return linkLeadAndMerge(existing, user.id);
    }

    return existing;
  }

  const claimed = await claimUnclaimedInvestorByEmail(user);
  if (claimed) {
    return linkLeadAndMerge(claimed, user.id);
  }

  let created: InvestorRow;
  try {
    created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(investors)
        .values({
          authUserId: user.id,
          email: user.email,
          fullName: ""
        })
        .returning();

      if (!row) {
        throw new Error("Investor insert returned no row.");
      }

      // Provisioning is not complete until its creation event is durable.
      // If auditing fails, the transaction removes the new investor row so a
      // retry does not take the existing-row path with a permanent audit gap.
      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: "investor.created",
        entityType: "investor",
        entityId: row.id,
        payload: { email: user.email }
      });

      return row;
    });
  } catch (error) {
    // A concurrent first request won the insert. Its row exists but its lead
    // linking may not have landed yet, so run the guarded link + merge here
    // too (a no-op if the winner already linked) for a consistent result.
    if (isUniqueViolation(error)) {
      // Bypass the per-request cache: the lookup above already memoized null
      // for this user, but the winning request's row exists now.
      const winner = await findExistingInvestor(user.id);
      if (winner) return linkLeadAndMerge(winner, user.id);
    }
    throw error;
  }

  return linkLeadAndMerge(created, user.id);
});

/** Staff gate; keeps `.id` / `.email` for existing call sites, plus staff fields. */
export async function requireAdmin() {
  const ctx = await requireStaff();
  return {
    id: ctx.user.id,
    email: ctx.user.email,
    staffId: ctx.staff.id,
    role: ctx.role,
    user: ctx.user,
    staff: ctx.staff
  };
}

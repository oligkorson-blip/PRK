import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { auditEvents, db, investors, leads } from "@/lib/db";

export type EmailMatchLead = {
  id: string;
  assignedAgentId: string | null;
  ibId: string | null;
  createdAt: Date;
};

/** Prefer assigned leads, then newest createdAt. */
export function orderLeadsForEmailMatch(
  leads: EmailMatchLead[]
): EmailMatchLead[] {
  if (leads.length === 0) return [];

  const byNewest = (a: EmailMatchLead, b: EmailMatchLead) =>
    b.createdAt.getTime() - a.createdAt.getTime();

  const assigned = leads.filter((lead) => lead.assignedAgentId != null);
  if (assigned.length > 0) {
    return [...assigned].sort(byNewest);
  }

  return [...leads].sort(byNewest);
}

export function pickLeadForEmailMatch(
  leads: EmailMatchLead[]
): EmailMatchLead | null {
  return orderLeadsForEmailMatch(leads)[0] ?? null;
}

type DbLike = Pick<typeof db, "select" | "update" | "insert">;

/**
 * Match unlinked leads by email and attach the best available candidate to an investor.
 * Terminal-status leads (unqualified, duplicate, converted) never match: a stale
 * unqualified/duplicate lead must not be revived into a conversion, and an already
 * converted lead must not carry agent attribution onto another investor.
 */
export async function linkLeadOnInvestorCreate(
  txOrDb: DbLike,
  investor: { id: string; email: string },
  actorUserId: string
): Promise<{ leadId: string | null; assignedAgentId: string | null }> {
  const candidates = await txOrDb
    .select({
      id: leads.id,
      assignedAgentId: leads.assignedAgentId,
      ibId: leads.ibId,
      createdAt: leads.createdAt
    })
    .from(leads)
    .where(
      and(
        sql`lower(${leads.email}) = ${investor.email.toLowerCase()}`,
        isNull(leads.investorId),
        notInArray(leads.status, ["unqualified", "duplicate", "converted"])
      )
    );

  const ordered = orderLeadsForEmailMatch(candidates);

  for (const lead of ordered) {
    const now = new Date();

    const updated = await txOrDb
      .update(leads)
      .set({ investorId: investor.id, status: "converted", updatedAt: now })
      .where(and(eq(leads.id, lead.id), isNull(leads.investorId)))
      .returning({ id: leads.id });

    if (updated.length === 0) {
      // Another signup won the race on this lead; try the next candidate.
      continue;
    }

    let assignedAgentId: string | null = null;
    if (lead.assignedAgentId) {
      // Only carry attribution onto an investor with no assignment of its own.
      // This also runs on the re-link path at every login (see ensureInvestor),
      // where a stale lead must never clobber a deliberate staff assignment.
      // The leads_agent_requires_ib CHECK guarantees lead.ibId is set here.
      const carried = await txOrDb
        .update(investors)
        .set({
          assignedAgentId: lead.assignedAgentId,
          ibId: lead.ibId,
          updatedAt: now
        })
        .where(
          and(eq(investors.id, investor.id), isNull(investors.assignedAgentId))
        )
        .returning({ id: investors.id });
      if (carried.length > 0) {
        assignedAgentId = lead.assignedAgentId;
      }
    }

    await txOrDb.insert(auditEvents).values({
      actorUserId,
      action: "lead.linked_on_signup",
      entityType: "lead",
      entityId: lead.id,
      payload: {
        investorId: investor.id,
        assignedAgentId
      }
    });

    return { leadId: lead.id, assignedAgentId };
  }

  return { leadId: null, assignedAgentId: null };
}

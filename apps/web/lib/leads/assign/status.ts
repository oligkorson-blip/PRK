"use server";

import { eq } from "drizzle-orm";
import { auditEvents, db, leads } from "@/lib/db";
import { leadVisibleToStaff } from "../scope";
import { loadLead, requireActor, revalidateLead, type LeadActionResult } from "./shared";

export async function setLeadFollowUp(input: {
  leadId: string;
  nextFollowUpAt: string | null;
}): Promise<LeadActionResult> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { staff } = actor;

  const lead = await loadLead(db, input.leadId);
  if (!lead) return { ok: false, error: "Lead not found." };

  if (
    !leadVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      lead: { assignedAgentId: lead.assignedAgentId, ibId: lead.ibId }
    })
  ) {
    return { ok: false, error: "You do not have access to this lead." };
  }

  let followUp: Date | null = null;
  if (input.nextFollowUpAt) {
    const parsed = new Date(input.nextFollowUpAt);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Invalid follow-up date." };
    }
    followUp = parsed;
  }

  await db
    .update(leads)
    .set({ nextFollowUpAt: followUp, updatedAt: new Date() })
    .where(eq(leads.id, lead.id));

  await db.insert(auditEvents).values({
    actorUserId: staff.user.id,
    action: "lead.follow_up_changed",
    entityType: "lead",
    entityId: lead.id,
    payload: { nextFollowUpAt: input.nextFollowUpAt, listId: lead.listId }
  });

  revalidateLead(lead.listId, lead.id);
  return { ok: true };
}

const SETTABLE_STATUSES = new Set([
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "duplicate"
]);

export async function setLeadStatus(input: {
  leadId: string;
  status: string;
}): Promise<LeadActionResult> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { staff } = actor;

  if (!SETTABLE_STATUSES.has(input.status)) {
    return { ok: false, error: "Invalid status." };
  }

  const lead = await loadLead(db, input.leadId);
  if (!lead) return { ok: false, error: "Lead not found." };

  if (
    !leadVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      lead: { assignedAgentId: lead.assignedAgentId, ibId: lead.ibId }
    })
  ) {
    return { ok: false, error: "You do not have access to this lead." };
  }

  // A converted lead linked to an investor is a client, not a pipeline row —
  // moving it back into the pipeline would desync the investor record.
  if (lead.status === "converted" && lead.investorId) {
    return {
      ok: false,
      error: "This lead is converted and linked to an investor; its stage cannot be changed."
    };
  }

  await db
    .update(leads)
    .set({
      status: input.status as "new" | "contacted" | "qualified" | "unqualified" | "duplicate",
      lastActivityAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(leads.id, lead.id));

  await db.insert(auditEvents).values({
    actorUserId: staff.user.id,
    action: "lead.status_changed",
    entityType: "lead",
    entityId: lead.id,
    payload: { status: input.status, listId: lead.listId }
  });

  revalidateLead(lead.listId, lead.id);
  return { ok: true };
}

"use server";

import { eq, inArray } from "drizzle-orm";
import { auditEvents, db, leads } from "@/lib/db";
import { leadVisibleToStaff } from "../scope";
import { requireActor, revalidateLead } from "./shared";

/** Stages offered by the bulk-action bar (spec A.3). */
const BULK_SETTABLE_STATUSES = new Set(["contacted", "qualified", "unqualified"]);

/** Hard cap so a crafted request cannot turn one call into an unbounded loop. */
const MAX_BULK_IDS = 100;

export type BulkSetLeadStatusResult =
  | { ok: true; updated: number; failed: { leadId: string; error: string }[] }
  | { ok: false; error: string };

/**
 * Move many leads to one stage. Scope and validity are checked per row:
 * rows that fail are reported in `failed` (never silently skipped) while the
 * rest still update, and every updated row gets its own audit event.
 */
export async function bulkSetLeadStatus(input: {
  leadIds: string[];
  status: string;
}): Promise<BulkSetLeadStatusResult> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { staff } = actor;

  if (!BULK_SETTABLE_STATUSES.has(input.status)) {
    return { ok: false, error: "Invalid status." };
  }

  const leadIds = [...new Set(input.leadIds)].slice(0, MAX_BULK_IDS);
  if (leadIds.length === 0) {
    return { ok: false, error: "No leads selected." };
  }

  const rows = await db
    .select({
      id: leads.id,
      listId: leads.listId,
      ibId: leads.ibId,
      assignedAgentId: leads.assignedAgentId,
      investorId: leads.investorId,
      status: leads.status
    })
    .from(leads)
    .where(inArray(leads.id, leadIds));
  const byId = new Map(rows.map((row) => [row.id, row]));

  const failed: { leadId: string; error: string }[] = [];
  let updated = 0;

  for (const leadId of leadIds) {
    const lead = byId.get(leadId);
    if (!lead) {
      failed.push({ leadId, error: "Lead not found." });
      continue;
    }
    if (
      !leadVisibleToStaff({
        role: staff.role,
        staffId: staff.staff.id,
        lead: { assignedAgentId: lead.assignedAgentId, ibId: lead.ibId }
      })
    ) {
      failed.push({ leadId, error: "You do not have access to this lead." });
      continue;
    }
    // Same rule as setLeadStatus: a converted lead with a linked investor
    // must never leave the converted stage.
    if (lead.status === "converted" && lead.investorId) {
      failed.push({
        leadId,
        error: "This lead is converted and linked to an investor; its stage cannot be changed."
      });
      continue;
    }

    await db
      .update(leads)
      .set({
        status: input.status as "contacted" | "qualified" | "unqualified",
        lastActivityAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(leads.id, lead.id));

    await db.insert(auditEvents).values({
      actorUserId: staff.user.id,
      action: "lead.status_changed",
      entityType: "lead",
      entityId: lead.id,
      payload: { status: input.status, listId: lead.listId, bulk: true }
    });

    updated += 1;
  }

  if (updated > 0) revalidateLead();
  return { ok: true, updated, failed };
}

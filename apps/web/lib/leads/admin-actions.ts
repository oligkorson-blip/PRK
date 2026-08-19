"use server";

import { eq } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/db/errors";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import {
  auditEvents,
  db,
  leadLists,
  leads
} from "@/lib/db";
import { assignLeadToAgent, removeLeadAgent } from "./assign/assign";
import { assignAllLeadsInList as assignAllLeadsInListBulk } from "./assign/bulk-assign";
import type { LeadActionResult } from "./assign/shared";
import { parseLeadsCsv, type ParseLeadsCsvError } from "./csv";

export type { LeadActionResult };

export type CreateLeadListResult =
  | { ok: true; listId: string }
  | { ok: false; error: string };

export type UploadLeadsResult =
  | { ok: true; imported: number; skipped: number; errors: ParseLeadsCsvError[] }
  | { ok: false; error: string };

/** A lead row is ~100 bytes; 5 MB is ~50k rows, far past any sane import. */
const MAX_CSV_BYTES = 5 * 1024 * 1024;

function revalidateLeads(listId?: string) {
  revalidatePath("/admin/leads");
  if (listId) {
    revalidatePath(`/admin/leads/${listId}`);
  }
}


export async function createLeadList(input: {
  name: string;
  defaultSource: string;
}): Promise<CreateLeadListResult> {
  let actor: { userId: string; staffId: string };
  try {
    const staff = await requireSuperAdmin();
    actor = { userId: staff.user.id, staffId: staff.staff.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "List name is required." };
  }

  const defaultSource = input.defaultSource.trim();

  let list: { id: string };
  try {
    list = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(leadLists)
        .values({
          name,
          defaultSource,
          createdByStaffId: actor.staffId
        })
        .returning({ id: leadLists.id });

      await tx.insert(auditEvents).values({
        actorUserId: actor.userId,
        action: "lead_list.created",
        entityType: "lead_list",
        entityId: inserted.id,
        payload: { name, defaultSource }
      });

      return inserted;
    });
  } catch (error) {
    // lead_lists_name_uidx is the only unique index the list insert can hit.
    if (isUniqueViolation(error)) {
      return { ok: false, error: "A list with that name already exists." };
    }
    throw error;
  }

  revalidateLeads(list.id);
  return { ok: true, listId: list.id };
}

export async function uploadLeadsCsv(input: {
  listId: string;
  csvText: string;
}): Promise<UploadLeadsResult> {
  let actorUserId: string;
  try {
    const staff = await requireSuperAdmin();
    actorUserId = staff.user.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }

  // Reject oversized payloads before touching the database.
  if (Buffer.byteLength(input.csvText, "utf8") > MAX_CSV_BYTES) {
    return { ok: false, error: "CSV must be 5 MB or smaller." };
  }

  const [list] = await db
    .select({
      id: leadLists.id,
      defaultSource: leadLists.defaultSource
    })
    .from(leadLists)
    .where(eq(leadLists.id, input.listId))
    .limit(1);

  if (!list) {
    return { ok: false, error: "Lead list not found." };
  }

  const parsed = parseLeadsCsv(input.csvText, {
    defaultSource: list.defaultSource
  });

  // Re-uploads must be idempotent: skip rows whose email is already in this
  // list, and collapse duplicate emails within the file itself.
  const existing = await db
    .select({ email: leads.email })
    .from(leads)
    .where(eq(leads.listId, list.id));
  const seen = new Set(existing.map((row) => row.email.toLowerCase()));

  const fresh: typeof parsed.ok = [];
  for (const row of parsed.ok) {
    const key = row.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(row);
  }
  const skipped = parsed.ok.length - fresh.length;

  // Imported rows and the import summary are one operation. If the audit
  // insert fails, no leads from this upload are committed.
  const imported = await db.transaction(async (tx) => {
    let insertedCount = 0;
    if (fresh.length > 0) {
      const inserted = await tx
        .insert(leads)
        .values(
          fresh.map((row) => ({
            listId: list.id,
            fullName: row.fullName,
            email: row.email,
            phone: row.phone,
            source: row.source,
            sourceDetail: row.sourceDetail,
            notes: row.notes
          }))
        )
        // Race guard: two concurrent uploads can both pass the seen-set check, so
        // let leads_list_email_lower_uidx arbitrate instead of erroring. No target —
        // drizzle can't name an expression index, and no other unique constraint
        // can fire on this insert. returning() yields only actually-inserted rows.
        .onConflictDoNothing()
        .returning({ id: leads.id });
      insertedCount = inserted.length;
    }

    await tx.insert(auditEvents).values({
      actorUserId,
      action: "leads.uploaded",
      entityType: "lead_list",
      entityId: list.id,
      payload: {
        imported: insertedCount,
        skipped,
        errorCount: parsed.errors.length
      }
    });

    return insertedCount;
  });

  revalidateLeads(list.id);
  return { ok: true, imported, skipped, errors: parsed.errors };
}

/**
 * Backwards-compatible wrapper. Prefer calling the engine actions directly:
 * `assignLeadToAgent`, `assignLeadToIb`, `removeLeadAgent`.
 */
export async function assignLead(input: {
  leadId: string;
  agentStaffId: string | null;
}): Promise<LeadActionResult> {
  if (input.agentStaffId === null) {
    return removeLeadAgent({ leadId: input.leadId });
  }
  return assignLeadToAgent({ leadId: input.leadId, agentStaffId: input.agentStaffId });
}

/**
 * Super Admin bulk variant. Implemented in ./assign/bulk-assign so the whole
 * batch shares one transaction with the per-lead assignment engine.
 */
export async function assignAllLeadsInList(input: {
  listId: string;
  agentStaffId?: string | null;
  ibStaffId?: string | null;
  unassignAll?: boolean;
}): Promise<LeadActionResult> {
  return assignAllLeadsInListBulk(input);
}

"use server";

import { eq } from "drizzle-orm";
import { auditEvents, db, leads } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { leadVisibleToStaff } from "../scope";
import { LEAD_EMAIL_RE } from "../csv";
import { requireActor, revalidateLead, type LeadActionResult } from "./shared";

/**
 * Edit a lead's contact details. Note: email participates in CSV dedupe and
 * signup lead→investor linking, so edits change future matching for this lead.
 */
export async function updateLeadDetails(input: {
  leadId: string;
  fullName: string;
  email: string;
  phone: string;
  notes: string;
}): Promise<LeadActionResult> {
  const actor = await requireActor();
  if (!actor.ok) return actor;
  const { staff } = actor;

  let result;
  try {
    result = await db.transaction(async (tx) => {
      // Lock the lead so assignment changes cannot race the staff scope check,
      // and capture the old email from the same row version that is updated.
      const [lead] = await tx
        .select({
          id: leads.id,
          listId: leads.listId,
          ibId: leads.ibId,
          assignedAgentId: leads.assignedAgentId,
          email: leads.email
        })
        .from(leads)
        .where(eq(leads.id, input.leadId))
        .for("update");

      if (!lead) {
        return { ok: false as const, error: "Lead not found." };
      }

      if (
        !leadVisibleToStaff({
          role: staff.role,
          staffId: staff.staff.id,
          lead: { assignedAgentId: lead.assignedAgentId, ibId: lead.ibId }
        })
      ) {
        return { ok: false as const, error: "You do not have access to this lead." };
      }

      const fullName = input.fullName.trim();
      const email = input.email.trim().toLowerCase();
      const phone = input.phone.trim();
      const notes = input.notes.trim();

      if (fullName.length < 2) return { ok: false as const, error: "Name is required." };
      if (fullName.length > 200) return { ok: false as const, error: "Name is too long." };
      if (!LEAD_EMAIL_RE.test(email)) {
        return { ok: false as const, error: "Enter a valid email address." };
      }
      if (phone.length > 40) {
        return { ok: false as const, error: "Phone number is too long." };
      }
      if (notes.length > 2000) {
        return { ok: false as const, error: "Notes are limited to 2,000 characters." };
      }

      await tx
        .update(leads)
        .set({
          fullName,
          email,
          phone: phone === "" ? null : phone,
          notes: notes === "" ? null : notes,
          updatedAt: new Date()
        })
        .where(eq(leads.id, lead.id));

      await tx.insert(auditEvents).values({
        actorUserId: staff.user.id,
        action: "lead.details_updated",
        entityType: "lead",
        entityId: lead.id,
        payload: { listId: lead.listId, fromEmail: lead.email, toEmail: email }
      });

      return { ok: true as const, listId: lead.listId, leadId: lead.id };
    });
  } catch (error) {
    // PostgreSQL aborts the transaction after a constraint violation. Map the
    // error only after Drizzle has rolled the transaction back.
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "Another lead in this list already uses that email."
      };
    }
    throw error;
  }

  if (!result.ok) {
    return result;
  }

  revalidateLead(result.listId, result.leadId);
  return { ok: true };
}

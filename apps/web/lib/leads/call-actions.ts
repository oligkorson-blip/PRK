"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import {
  auditEvents,
  db,
  leadCallAttempts,
  leads
} from "@/lib/db";
import { parseLeadCallOutcome } from "./outcomes";
import { leadVisibleToStaff } from "./scope";

export type LogCallAttemptResult = { ok: true } | { ok: false; error: string };

const LEAD_NOT_FOUND_IN_TX = "LEAD_NOT_FOUND_IN_TX";
const LEAD_SCOPE_CHANGED = "LEAD_SCOPE_CHANGED";

function parseCalledAt(value: string | Date | undefined): Date | null {
  if (value === undefined) return new Date();
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function canSeeLead(
  staff: { role: "super_admin" | "ib" | "agent" },
  staffId: string,
  lead: { assignedAgentId: string | null; ibId: string | null }
): boolean {
  return leadVisibleToStaff({ role: staff.role, staffId, lead });
}

export async function logCallAttempt(input: {
  leadId: string;
  outcome: string;
  notes?: string | null;
  calledAt?: string | Date;
  followUpAt?: string | Date | null;
}): Promise<LogCallAttemptResult> {
  let staff: Awaited<ReturnType<typeof requireStaff>>;
  try {
    staff = await requireStaff();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }

  const outcome = parseLeadCallOutcome(input.outcome);
  if (!outcome) {
    return { ok: false, error: "Invalid call outcome." };
  }

  const calledAt = parseCalledAt(input.calledAt);
  if (!calledAt) {
    return { ok: false, error: "Invalid call time." };
  }

  // Never trust future timestamps from the client: a future-dated call would
  // hide the lead from "unworked" queues and skew activity dashboards.
  const now = new Date();
  const effectiveCalledAt = calledAt.getTime() > now.getTime() ? now : calledAt;

  let followUpAt: Date | null | undefined = undefined;
  if (input.followUpAt !== undefined && input.followUpAt !== null && input.followUpAt !== "") {
    const parsed = parseCalledAt(input.followUpAt);
    if (!parsed) {
      return { ok: false, error: "Invalid follow-up date." };
    }
    followUpAt = parsed;
  } else if (input.followUpAt === null) {
    followUpAt = null;
  }

  const notes =
    input.notes == null || input.notes.trim() === "" ? null : input.notes.trim();

  let committed: { listId: string; attemptId: string };
  try {
    committed = await db.transaction(async (tx) => {
      // The lead row is the authorization boundary. Re-read it under a row
      // lock so reassignment cannot land between the access check and writes.
      const leadQuery = tx
        .select({
          id: leads.id,
          listId: leads.listId,
          assignedAgentId: leads.assignedAgentId,
          ibId: leads.ibId,
          status: leads.status,
          lastActivityAt: leads.lastActivityAt
        })
        .from(leads)
        .where(eq(leads.id, input.leadId))
        .limit(1);
      const [lockedLead] = await leadQuery.for("update");

      if (!lockedLead) {
        throw new Error(LEAD_NOT_FOUND_IN_TX);
      }

      if (!canSeeLead(staff, staff.staff.id, lockedLead)) {
        throw new Error(LEAD_SCOPE_CHANGED);
      }

      // Keep the activity marker monotonic when an older call is backfilled.
      const lastActivityAt =
        lockedLead.lastActivityAt &&
        lockedLead.lastActivityAt.getTime() > effectiveCalledAt.getTime()
          ? lockedLead.lastActivityAt
          : effectiveCalledAt;

      const [attempt] = await tx
        .insert(leadCallAttempts)
        .values({
          leadId: lockedLead.id,
          agentId: staff.staff.id,
          calledAt: effectiveCalledAt,
          outcome,
          notes
        })
        .returning({ id: leadCallAttempts.id });

      if (!attempt) {
        throw new Error("CALL_ATTEMPT_NOT_CREATED");
      }

      // The call, lead activity update, and audit event commit together.
      await tx
        .update(leads)
        .set({
          lastActivityAt,
          ...(lockedLead.status === "new" ? { status: "contacted" as const } : {}),
          ...(followUpAt !== undefined ? { nextFollowUpAt: followUpAt } : {}),
          updatedAt: new Date()
        })
        .where(eq(leads.id, lockedLead.id));

      await tx.insert(auditEvents).values({
        actorUserId: staff.user.id,
        action: "lead.call_logged",
        entityType: "lead",
        entityId: lockedLead.id,
        payload: {
          attemptId: attempt.id,
          outcome,
          calledAt: effectiveCalledAt.toISOString(),
          notes,
          listId: lockedLead.listId
        }
      });

      return { listId: lockedLead.listId, attemptId: attempt.id };
    });
  } catch (error) {
    if (error instanceof Error && error.message === LEAD_NOT_FOUND_IN_TX) {
      return { ok: false, error: "Lead not found." };
    }
    if (error instanceof Error && error.message === LEAD_SCOPE_CHANGED) {
      return { ok: false, error: "You do not have access to this lead." };
    }
    throw error;
  }

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${committed.listId}`);
  revalidatePath(`/admin/leads/lead/${input.leadId}`);

  return { ok: true };
}

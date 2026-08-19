"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import { auditEvents, db, investorNotes, investors } from "@/lib/db";

export type AddInvestorNoteResult = { ok: true; noteId: string } | { ok: false; error: string };

const MAX_NOTE_LENGTH = 2000;

export async function addInvestorNote(input: {
  investorId: string;
  body: string;
}): Promise<AddInvestorNoteResult> {
  let staff;
  try {
    staff = await requireStaff();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { ok: false, error: "Forbidden." };
    throw error;
  }

  const result = await db.transaction(async (tx): Promise<AddInvestorNoteResult> => {
    // Lock the investor row so assignment changes cannot race the scope check
    // and note creation. The note and its audit record then commit together.
    const [investor] = await tx
      .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
      .from(investors)
      .where(eq(investors.id, input.investorId))
      .for("update");

    if (
      !investor ||
      !investorVisibleToStaff({
        role: staff.role,
        staffId: staff.staff.id,
        investor: { assignedAgentId: investor.assignedAgentId, ibId: investor.ibId }
      })
    ) {
      return { ok: false, error: "Investor not found." };
    }

    const body = input.body.trim();
    if (!body) {
      return { ok: false, error: "Note cannot be empty." };
    }
    if (body.length > MAX_NOTE_LENGTH) {
      return { ok: false, error: `Note is too long (${MAX_NOTE_LENGTH} characters max).` };
    }

    const [note] = await tx
      .insert(investorNotes)
      .values({
        investorId: input.investorId,
        authorStaffId: staff.staff.id,
        body
      })
      .returning({ id: investorNotes.id });

    await tx.insert(auditEvents).values({
      actorUserId: staff.user.id,
      action: "investor.note_added",
      entityType: "investor",
      entityId: input.investorId,
      payload: { noteId: note.id }
    });

    return { ok: true, noteId: note.id };
  });

  if (result.ok) {
    revalidatePath(`/admin/investors/${input.investorId}`);
  }
  return result;
}

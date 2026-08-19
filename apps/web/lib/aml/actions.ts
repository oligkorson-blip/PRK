"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/investor";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { auditEvents, db, investors, kycChecks } from "@/lib/db";
import { validateScreeningInput } from "./validation";

export type RecordScreeningResult = { ok: true; id: string } | { ok: false; error: string };

export async function recordScreening(input: {
  investorId: string;
  result: string;
  screeningNote: string;
  sourceOfFundsNote?: string;
}): Promise<RecordScreeningResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const parsed = validateScreeningInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const now = new Date();
  let outcome: RecordScreeningResult;
  try {
    outcome = await db.transaction(async (tx): Promise<RecordScreeningResult> => {
      // Lock the investor so assignment changes cannot race the staff scope
      // check. Authorization, screening, and audit now share one row version.
      const [target] = await tx
        .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
        .from(investors)
        .where(eq(investors.id, input.investorId))
        .for("update");

      if (!target) return { ok: false, error: "Investor not found." };
      if (
        !investorVisibleToStaff({
          role: admin.role,
          staffId: admin.staffId,
          investor: { assignedAgentId: target.assignedAgentId, ibId: target.ibId }
        })
      ) {
        return { ok: false, error: "Forbidden." };
      }

      const [row] = await tx
        .insert(kycChecks)
        .values({
          investorId: input.investorId,
          result: parsed.data.result,
          screeningNote: parsed.data.screeningNote,
          sourceOfFundsNote: parsed.data.sourceOfFundsNote,
          reviewedByStaffId: admin.staffId,
          reviewedAt: now
        })
        .returning({ id: kycChecks.id });

      await tx.insert(auditEvents).values({
        actorUserId: admin.id,
        action: "aml.screening_recorded",
        entityType: "investor",
        entityId: input.investorId,
        payload: { kycCheckId: row.id, result: parsed.data.result }
      });

      return { ok: true, id: row.id };
    });
  } catch (error) {
    console.error("[aml:recordScreening]", error);
    return { ok: false, error: "Could not record the screening. Please try again." };
  }

  if (!outcome.ok) return outcome;

  revalidatePath("/admin/aml-checklist");
  revalidatePath(`/admin/investors/${input.investorId}`);
  return outcome;
}

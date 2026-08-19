"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureInvestor } from "@/lib/auth/investor";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { auditEvents, db, investors } from "@/lib/db";
import { isUuid } from "@/lib/format";
import { AlreadyErasedError, eraseInvestorPii, isErasedInvestorEmail } from "./erasure";
import { collectInvestorDataExport, type InvestorDataExport } from "./export";

export type ExportMyDataResult =
  | { ok: true; data: InvestorDataExport }
  | { ok: false; error: string };

/**
 * Self-serve GDPR export. The investor id comes from the session via
 * ensureInvestor — callers can never export someone else's data.
 */
export async function exportMyData(): Promise<ExportMyDataResult> {
  let investor: Awaited<ReturnType<typeof ensureInvestor>>;
  try {
    investor = await ensureInvestor();
  } catch {
    return { ok: false, error: "Unauthenticated." };
  }

  // A session-backed investor must be linked to the auth user that owns it.
  // Refuse an inconsistent row rather than creating an unattributed disclosure.
  if (!investor.authUserId) {
    return { ok: false, error: "Unauthenticated." };
  }

  try {
    const data = await collectInvestorDataExport({
      investorId: investor.id,
      authUserId: investor.authUserId
    });

    // The export contains financial, KYC, application, and sign-in data.
    // Do not disclose it unless the corresponding compliance event persists.
    await db.insert(auditEvents).values({
      actorUserId: investor.authUserId,
      action: "investor.data_exported",
      entityType: "investor",
      entityId: investor.id,
      payload: { format: "json", generatedAt: data.generatedAt }
    });

    return { ok: true, data };
  } catch {
    return { ok: false, error: "Could not prepare your data export. Try again." };
  }
}

export type EraseInvestorResult = { ok: true } | { ok: false; error: string };

/**
 * Super-admin erasure behind typed confirmation (the investor's email).
 * Keeps the financial ledger; with legalHold the KYC documents stay and the
 * reason is recorded in the audit event.
 */
export async function eraseInvestorAction(input: {
  investorId: string;
  confirmEmail: string;
  legalHold: boolean;
  legalHoldReason?: string;
}): Promise<EraseInvestorResult> {
  let actorUserId: string;
  try {
    const staff = await requireSuperAdmin();
    actorUserId = staff.user.id;
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  if (!isUuid(input.investorId)) {
    return { ok: false, error: "Investor not found." };
  }

  const [investor] = await db
    .select({ id: investors.id, email: investors.email })
    .from(investors)
    .where(eq(investors.id, input.investorId))
    .limit(1);
  if (!investor) {
    return { ok: false, error: "Investor not found." };
  }
  if (isErasedInvestorEmail(investor.email, investor.id)) {
    return { ok: false, error: "This investor has already been erased." };
  }
  if (input.confirmEmail.trim().toLowerCase() !== investor.email.toLowerCase()) {
    return { ok: false, error: "Type the investor's email address to confirm erasure." };
  }
  const legalHoldReason = input.legalHoldReason?.trim() ?? "";
  if (input.legalHold && !legalHoldReason) {
    return { ok: false, error: "Give a reason for the legal hold." };
  }

  try {
    await eraseInvestorPii({
      investorId: investor.id,
      legalHold: input.legalHold,
      actorUserId,
      legalHoldReason: input.legalHold ? legalHoldReason : null
    });
  } catch (err) {
    // Lost a concurrent double-submit race on the investor row lock: the
    // winning invocation already erased and audited, so no duplicate event.
    if (err instanceof AlreadyErasedError) {
      return { ok: false, error: "This investor has already been erased." };
    }
    return { ok: false, error: "Could not erase investor. Please try again." };
  }

  revalidatePath(`/admin/investors/${investor.id}`);
  revalidatePath("/admin/investors");
  return { ok: true };
}

"use server";

import { and, eq, gte } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/db/errors";
import { ensureInvestor } from "@/lib/auth/investor";
import { canExpressInterest, isOnboardingComplete } from "@/lib/auth/gates";
import { assets, auditEvents, db, interests, investors } from "@/lib/db";
import { formatEur } from "@/lib/format";
import { sendTransactionalEmail } from "@/lib/email/send";
import { interpretPendingClaim, wherePendingInterest } from "./claim-pending";
import { assertTransition } from "./transitions";
import { validateInterestAmount, validateInterestNote } from "./validation";
import { MAX_INTERESTS_PER_DAY, startOfUtcDay } from "./rate-limit";
import { findOption, type InvestmentOption } from "@/lib/assets/investment-options";
import { fundingForAssets } from "@/lib/assets/funding";
import { isPoolInvestmentsEnabled } from "@/lib/platform-settings/queries";

export type InterestActionResult = { ok: true; interestId: string } | { ok: false; error: string };
export type WithdrawInterestResult = { ok: true } | { ok: false; error: string };

const INTEREST_DAILY_LIMIT = "INTEREST_DAILY_LIMIT";

type InterestEmailType = "interest.created";

type InterestEmailPayload = {
  to: string;
  assetName: string;
  amountEur: number;
};

// Wraps sendTransactionalEmail with Parkwise-specific copy so callers only
// pass structured data, not hand-written subject/body strings.
async function sendInterestEmail(
  type: InterestEmailType,
  payload: InterestEmailPayload
): Promise<{ sent: boolean; skipped?: boolean }> {
  const subject = `Interest received: ${payload.assetName}`;
  const text = `We received your interest of ${formatEur(payload.amountEur)} in ${payload.assetName}. Our team will review it and follow up shortly. Capital is at risk; target returns are never guaranteed.`;
  return sendTransactionalEmail({ to: payload.to, subject, text });
}

export async function createInterest(input: {
  assetSlug: string;
  amountEur: number;
  note?: string | null;
  optionId?: string | null;
  riskAcknowledged?: boolean;
}): Promise<InterestActionResult> {
  let investor;
  try {
    investor = await ensureInvestor();
  } catch {
    return { ok: false, error: "Please sign in to express interest." };
  }

  if (!isOnboardingComplete(investor)) {
    return { ok: false, error: "Please complete onboarding before expressing interest." };
  }
  if (!canExpressInterest(investor)) {
    return { ok: false, error: "Your account isn’t ready for investment actions yet. Talk to the team." };
  }
  // New investors are not investment-enabled by default. This is an admin-only
  // control; browsing published provider opportunities remains public.
  if (investor.poolInvestmentsEnabled === false) {
    return {
      ok: false,
      error: "Investment access has not been enabled for your account yet. Contact the Parkwise team."
    };
  }

  if (!(await isPoolInvestmentsEnabled())) {
    return {
      ok: false,
      error: "Location-pool investments are not currently accepting new requests."
    };
  }

  if (!input.riskAcknowledged) {
    return {
      ok: false,
      error: "Confirm you understand this is non-binding and have read the Risk Disclosure."
    };
  }

  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.slug, input.assetSlug), eq(assets.status, "published")))
    .limit(1);
  if (!asset) {
    return { ok: false, error: "This opportunity is not available." };
  }

  const fundingMap = await fundingForAssets([
    { id: asset.id, advisoryCapacityEur: asset.advisoryCapacityEur }
  ]);
  const funding = fundingMap.get(asset.id);
  if (funding && !funding.open) {
    return {
      ok: false,
      error: "This opportunity is fully funded. New interest is closed."
    };
  }

  const options = (asset.investmentOptions ?? []) as InvestmentOption[];
  let optionId: string | null = null;
  let minTicket = asset.minTicketEur;

  if (options.length > 0) {
    const selected = findOption(options, input.optionId);
    if (!selected) {
      return { ok: false, error: "Select a valid investment option." };
    }
    optionId = selected.id;
    minTicket = selected.minTicketEur;
  }

  const amountResult = validateInterestAmount(input.amountEur, minTicket);
  if (!amountResult.ok) {
    return { ok: false, error: amountResult.error };
  }
  const noteResult = validateInterestNote(input.note);
  if (!noteResult.ok) {
    return { ok: false, error: noteResult.error };
  }

  const [existingPending] = await db
    .select({ id: interests.id })
    .from(interests)
    .where(
      and(
        eq(interests.investorId, investor.id),
        eq(interests.assetId, asset.id),
        eq(interests.status, "pending")
      )
    )
    .limit(1);
  if (existingPending) {
    return { ok: false, error: "You already have a pending interest in this opportunity." };
  }

  let created;
  try {
    created = await db.transaction(async (tx) => {
      // Lock the investor row so concurrent requests serialize on the daily cap check.
      await tx
        .select({ id: investors.id })
        .from(investors)
        .where(eq(investors.id, investor.id))
        .limit(1)
        .for("update");

      const todaysInterests = await tx
        .select({ id: interests.id })
        .from(interests)
        .where(and(eq(interests.investorId, investor.id), gte(interests.createdAt, startOfUtcDay(new Date()))));
      if (todaysInterests.length >= MAX_INTERESTS_PER_DAY) {
        throw new Error(INTEREST_DAILY_LIMIT);
      }

      const [inserted] = await tx
        .insert(interests)
        .values({
          investorId: investor.id,
          assetId: asset.id,
          amountEur: input.amountEur,
          optionId,
          note: noteResult.note
        })
        .returning();

      // Interest creation and its audit trail are one financial operation.
      // If audit persistence fails, the inserted interest rolls back too.
      await tx.insert(auditEvents).values({
        actorUserId: investor.authUserId ?? "unknown",
        action: "interest.created",
        entityType: "interest",
        entityId: inserted.id,
        payload: { assetSlug: asset.slug, amountEur: input.amountEur, optionId }
      });

      return inserted;
    });
  } catch (error) {
    if (error instanceof Error && error.message === INTEREST_DAILY_LIMIT) {
      return {
        ok: false,
        error: `You've reached the limit of ${MAX_INTERESTS_PER_DAY} interests per day. Please try again tomorrow.`
      };
    }
    if (isUniqueViolation(error)) {
      return { ok: false, error: "You already have a pending interest in this asset." };
    }
    throw error;
  }

  try {
    await sendInterestEmail("interest.created", {
      to: investor.email,
      assetName: asset.name,
      amountEur: input.amountEur
    });
  } catch (error) {
    console.error("[email:interest.created]", error);
  }

  const opsInbox = process.env.OPS_INBOX_EMAIL;
  if (opsInbox) {
    try {
      await sendTransactionalEmail({
        to: opsInbox,
        subject: `New interest: ${asset.name}`,
        text: `${investor.email} expressed interest of ${formatEur(input.amountEur)} in ${asset.name}${
          optionId ? ` (${optionId})` : ""
        }.${noteResult.note ? ` Note: ${noteResult.note}` : ""}`
      });
    } catch (error) {
      console.error("[email:ops]", error);
    }
  }

  return { ok: true, interestId: created.id };
}

export async function withdrawInterest(input: { interestId: string }): Promise<WithdrawInterestResult> {
  let investor;
  try {
    investor = await ensureInvestor();
  } catch {
    return { ok: false, error: "Please sign in to continue." };
  }

  // Same account-standing gate as createInterest: a suspended investor must
  // not mutate interests either.
  if (!canExpressInterest(investor)) {
    return { ok: false, error: "Your account isn’t ready for investment actions yet. Talk to the team." };
  }

  const [interest] = await db
    .select()
    .from(interests)
    .where(and(eq(interests.id, input.interestId), eq(interests.investorId, investor.id)))
    .limit(1);
  if (!interest) {
    return { ok: false, error: "Interest not found." };
  }

  try {
    assertTransition(interest.status, "withdrawn");
  } catch {
    return { ok: false, error: "This interest can no longer be withdrawn." };
  }

  // The guarded status claim and its audit record must commit together.
  // A failed audit insert must never leave an unaudited withdrawal behind.
  const withdrawn = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(interests)
      .set({ status: "withdrawn", updatedAt: new Date() })
      .where(wherePendingInterest(interest.id, { investorId: investor.id }))
      .returning({ id: interests.id });

    if (!interpretPendingClaim(claimed).claimed) {
      return false;
    }

    await tx.insert(auditEvents).values({
      actorUserId: investor.authUserId ?? "unknown",
      action: "interest.withdrawn",
      entityType: "interest",
      entityId: interest.id,
      payload: {}
    });

    return true;
  });

  if (!withdrawn) {
    return { ok: false, error: "This interest can no longer be withdrawn." };
  }

  return { ok: true };
}
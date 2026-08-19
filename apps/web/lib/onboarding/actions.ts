"use server";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { ensureInvestor } from "@/lib/auth/investor";
import { isOnboardingComplete } from "@/lib/auth/gates";
import { auditEvents, db, investors } from "@/lib/db";
import { onboardingFormDataToInput, onboardingFormSchema } from "./schema";

export type CompleteOnboardingResult = { ok: true } | { ok: false; error: string };

export async function completeOnboarding(
  _prevState: CompleteOnboardingResult,
  formData: FormData
): Promise<CompleteOnboardingResult> {
  const investor = await ensureInvestor();

  // Idempotent: re-submitting after completion is a no-op success rather
  // than an error, so a stale tab/back-button doesn't strand the investor.
  // Checks the full completion gate (status + both acceptances), not just
  // onboardingStatus, so a partially-migrated/legacy record isn't treated
  // as done.
  if (isOnboardingComplete(investor)) {
    return { ok: true };
  }

  // The account type comes from the investor row, never from the form — the
  // company branch skips DOB/nationality, so trusting a posted field would
  // let an individual bypass the personal CDD requirements.
  const accountType = investor.accountType ?? "individual";
  const parsed = onboardingFormSchema.safeParse(onboardingFormDataToInput(formData, accountType));
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { ok: false, error: firstIssue?.message ?? "Please check your answers and try again." };
  }

  const { pepDeclaration, investmentHorizon, sourceOfFunds } = parsed.data;
  const now = new Date();

  const baseValues = {
    fullName: parsed.data.fullName,
    country: parsed.data.country,
    phone: parsed.data.phone ? parsed.data.phone : null,
    address: parsed.data.address,
    pepDeclaration,
    onboardingStatus: "completed" as const,
    eligibilityAnswers: {
      isQualifyingInvestor: parsed.data.isQualifyingInvestor,
      understandsCapitalAtRisk: parsed.data.understandsCapitalAtRisk,
      investmentHorizon,
      sourceOfFunds
    },
    termsAcceptedAt: now,
    riskAcceptedAt: now,
    updatedAt: now
  };

  const values =
    parsed.data.accountType === "company"
      ? {
          ...baseValues,
          dateOfBirth: null,
          nationality: null,
          companyLegalName: parsed.data.companyLegalName,
          countryOfIncorporation: parsed.data.countryOfIncorporation,
          companyNumber: parsed.data.companyNumber
        }
      : {
          ...baseValues,
          dateOfBirth: parsed.data.dateOfBirth,
          nationality: parsed.data.nationality
        };

  try {
    await db.transaction(async (tx) => {
      // Only the request that moves an incomplete record to the complete state
      // writes the matching audit event. Concurrent repeat submissions are no-ops.
      const updated = await tx
        .update(investors)
        .set(values)
        .where(
          and(
            eq(investors.id, investor.id),
            or(
              ne(investors.onboardingStatus, "completed"),
              isNull(investors.termsAcceptedAt),
              isNull(investors.riskAcceptedAt)
            )
          )
        )
        .returning({ id: investors.id });

      if (updated.length === 0) return;

      await tx.insert(auditEvents).values({
        actorUserId: investor.authUserId ?? "unknown",
        action: "onboarding.completed",
        entityType: "investor",
        entityId: investor.id,
        payload: { investmentHorizon, sourceOfFunds }
      });
    });
  } catch (error) {
    console.error("[onboarding:complete]", error);
    return { ok: false, error: "We couldn't save your setup just yet. Please try again, or contact the team if it continues." };
  }

  return { ok: true };
}
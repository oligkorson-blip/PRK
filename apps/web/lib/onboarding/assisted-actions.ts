"use server";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/investor";
import { isOnboardingComplete } from "@/lib/auth/gates";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { auditEvents, db, investors } from "@/lib/db";
import { onboardingProfileSchema } from "./schema";

export type AssistedActionResult = { ok: true } | { ok: false; error: string };

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

// Full-row lookup + staff scoping shared by the assisted onboarding actions.
// Returns null for missing and out-of-scope alike — no existence oracle.
async function findScopedInvestor(investorId: string, admin: AdminContext) {
  const [target] = await db
    .select()
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);
  if (!target) return null;
  if (
    !investorVisibleToStaff({
      role: admin.role,
      staffId: admin.staffId,
      investor: { assignedAgentId: target.assignedAgentId, ibId: target.ibId }
    })
  ) {
    return null;
  }
  return target;
}

/**
 * Staff save of the onboarding profile on behalf of an investor. Validates
 * with onboardingProfileSchema (same rules as the self-serve form, minus the
 * declaration checkboxes) and writes the same investors columns. A blank
 * phone preserves the existing value — partial edits don't null out data.
 */
export async function assistedOnboardingProfile(
  investorId: string,
  fields: unknown
): Promise<AssistedActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const target = await findScopedInvestor(investorId, admin);
  if (!target) return { ok: false, error: "Not found" };

  // The account type comes from the investor row (never the posted fields) so
  // the company branch — which skips DOB/nationality — can't be forced onto
  // an individual account.
  const accountType = target.accountType ?? "individual";
  const candidate =
    typeof fields === "object" && fields !== null
      ? { ...fields, accountType }
      : { accountType };
  const parsed = onboardingProfileSchema.safeParse(candidate);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { ok: false, error: firstIssue?.message ?? "Please check the profile and try again." };
  }

  const { pepDeclaration, investmentHorizon, sourceOfFunds } = parsed.data;
  const now = new Date();

  const baseValues = {
    fullName: parsed.data.fullName,
    country: parsed.data.country,
    phone: parsed.data.phone ? parsed.data.phone : target.phone,
    address: parsed.data.address,
    pepDeclaration,
    eligibilityAnswers: {
      ...target.eligibilityAnswers,
      investmentHorizon,
      sourceOfFunds
    },
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

  const saved = await db.transaction(async (tx) => {
    const updated = await tx
      .update(investors)
      .set(values)
      .where(eq(investors.id, investorId))
      .returning({ id: investors.id });

    if (updated.length === 0) {
      return false;
    }

    await tx.insert(auditEvents).values({
      actorUserId: admin.id,
      action: "onboarding.assisted_profile_saved",
      entityType: "investor",
      entityId: investorId,
      payload: { staffId: admin.staffId, investmentHorizon, sourceOfFunds }
    });

    return true;
  });

  if (!saved) {
    return { ok: false, error: "Not found" };
  }

  revalidatePath(`/admin/investors/${investorId}`);
  revalidatePath("/portal");
  return { ok: true };
}

/**
 * Staff acceptance of the onboarding declarations on behalf of an investor.
 * Refuses unless the stored profile fully validates (same rules as
 * completeOnboarding), then sets the same acceptance timestamps/flags and
 * onboardingStatus: "completed". Idempotent like completeOnboarding.
 */
export async function assistedAcceptDeclarations(
  investorId: string
): Promise<AssistedActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const target = await findScopedInvestor(investorId, admin);
  if (!target) return { ok: false, error: "Not found" };

  // Idempotent, mirrors completeOnboarding: a repeat click changes nothing.
  if (isOnboardingComplete(target)) {
    return { ok: true };
  }

  const eligibility = target.eligibilityAnswers;
  const accountType = target.accountType ?? "individual";
  const baseCandidate = {
    accountType,
    fullName: target.fullName,
    country: target.country,
    phone: target.phone ?? "",
    address: target.address ?? "",
    pepDeclaration: target.pepDeclaration,
    investmentHorizon: eligibility.investmentHorizon,
    sourceOfFunds: eligibility.sourceOfFunds
  };
  const candidate =
    accountType === "company"
      ? {
          ...baseCandidate,
          companyLegalName: target.companyLegalName ?? "",
          countryOfIncorporation: target.countryOfIncorporation ?? "",
          companyNumber: target.companyNumber ?? ""
        }
      : {
          ...baseCandidate,
          dateOfBirth: target.dateOfBirth ?? "",
          nationality: target.nationality ?? ""
        };
  if (!onboardingProfileSchema.safeParse(candidate).success) {
    return { ok: false, error: "Profile is incomplete — save the onboarding profile first." };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    // Only the request that moves an incomplete record to the complete state
    // writes the matching audit event. Concurrent repeat submissions are no-ops.
    const updated = await tx
      .update(investors)
      .set({
        onboardingStatus: "completed",
        eligibilityAnswers: {
          ...eligibility,
          isQualifyingInvestor: true,
          understandsCapitalAtRisk: true
        },
        termsAcceptedAt: now,
        riskAcceptedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(investors.id, investorId),
          or(
            ne(investors.onboardingStatus, "completed"),
            isNull(investors.termsAcceptedAt),
            isNull(investors.riskAcceptedAt)
          )
        )
      )
      .returning({ id: investors.id });

    if (updated.length === 0) {
      return;
    }

    await tx.insert(auditEvents).values({
      actorUserId: admin.id,
      action: "onboarding.assisted_completed",
      entityType: "investor",
      entityId: investorId,
      payload: { staffId: admin.staffId }
    });
  });

  revalidatePath(`/admin/investors/${investorId}`);
  revalidatePath("/portal");
  return { ok: true };
}

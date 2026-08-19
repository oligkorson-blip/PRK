"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  assets,
  auditEvents,
  contracts,
  db,
  interests,
  investors
} from "@/lib/db";
import { createContract } from "@/lib/contracts/service";
import { isUuid } from "@/lib/format";

export type CreateAgreementResult =
  | { ok: true; contractId: string }
  | { ok: false; error: string };

function legalSignerFromEnv(): { email: string; name: string } | null {
  const email = (process.env.CONTRACT_LEGAL_SIGNER_EMAIL || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  const name = (process.env.CONTRACT_LEGAL_SIGNER_NAME || "").trim() || "Park legal signer";
  return { email, name };
}

function fallbackLegalSigner(): { email: string; name: string } | null {
  const fromEnv = legalSignerFromEnv();
  if (fromEnv) return fromEnv;
  const supers = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (supers[0]) {
    return { email: supers[0], name: "Park legal signer" };
  }
  return null;
}

/**
 * Super-admin action: create a ready-to-review agreement linked to a confirmed interest.
 */
export async function createAgreementFromInterest(input: {
  interestId: string;
}): Promise<CreateAgreementResult> {
  let admin: Awaited<ReturnType<typeof requireSuperAdmin>>;
  try {
    admin = await requireSuperAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  if (!isUuid(input.interestId)) {
    return { ok: false, error: "Interest not found." };
  }

  const legal = fallbackLegalSigner();
  if (!legal) {
    return {
      ok: false,
      error: "Set CONTRACT_LEGAL_SIGNER_EMAIL (or SUPER_ADMIN_EMAILS) before creating agreements."
    };
  }

  const [row] = await db
    .select({
      interest: interests,
      investor: investors,
      asset: assets
    })
    .from(interests)
    .innerJoin(investors, eq(interests.investorId, investors.id))
    .innerJoin(assets, eq(interests.assetId, assets.id))
    .where(eq(interests.id, input.interestId))
    .limit(1);

  if (!row) return { ok: false, error: "Interest not found." };
  if (row.interest.status !== "confirmed") {
    return { ok: false, error: "Confirm the interest before creating an agreement." };
  }

  const [existing] = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.interestId, input.interestId))
    .limit(1);
  if (existing) {
    return { ok: false, error: "An agreement already exists for this interest." };
  }

  const versionBase = `interest-${input.interestId.slice(0, 8)}`;
  let version = versionBase;
  const [versionClash] = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.investorId, row.investor.id), eq(contracts.version, version)))
    .limit(1);
  if (versionClash) {
    version = `${versionBase}-${Date.now().toString(36)}`;
  }

  const investorName =
    row.investor.fullName?.trim() || row.investor.email.split("@")[0] || "Investor";

  try {
    const contract = await createContract({
      investorId: row.investor.id,
      interestId: input.interestId,
      version,
      createdByActorId: admin.user.id,
      createdByActorType: "staff",
      source: "admin.create_from_interest",
      signers: [
        {
          role: "investor",
          displayName: investorName,
          email: row.investor.email
        },
        {
          role: "legal_signer",
          displayName: legal.name,
          email: legal.email
        }
      ]
    });

    await db.insert(auditEvents).values({
      actorUserId: admin.user.id,
      action: "contract.created_from_interest",
      entityType: "contract",
      entityId: contract.id,
      payload: {
        interestId: input.interestId,
        investorId: row.investor.id,
        assetSlug: row.asset.slug,
        version: contract.version
      }
    });

    revalidatePath("/admin/contracts");
    revalidatePath(`/admin/contracts/${contract.id}`);
    revalidatePath("/admin/interests");
    revalidatePath("/portal/contracts");
    return { ok: true, contractId: contract.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "An agreement already exists for this interest." };
    }
    console.error("[contracts:createAgreementFromInterest]", error);
    return { ok: false, error: "Could not create the agreement. Please try again." };
  }
}

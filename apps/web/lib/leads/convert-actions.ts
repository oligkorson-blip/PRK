"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { approveAndInvite } from "@/lib/apply/admin-actions";
import { requireStaff, investorVisibleToStaff } from "@/lib/auth/staff";
import {
  auditEvents,
  db,
  investorApplications,
  investors,
  leads
} from "@/lib/db";
import { isUuid } from "@/lib/format";
import { leadVisibleToStaff } from "@/lib/leads/scope";

export type ConvertLeadResult =
  | { ok: true; investorId: string; inviteUrl: string; emailSent: boolean }
  | { ok: false; error: string };

/**
 * Convert a CRM lead into an investor application and send a portal invite.
 * Reuses approveAndInvite so invite TTL / email behaviour stays single-sourced.
 */
export async function convertLeadToInvestorInvite(input: {
  leadId: string;
}): Promise<ConvertLeadResult> {
  let staff: Awaited<ReturnType<typeof requireStaff>>;
  try {
    staff = await requireStaff();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  if (!isUuid(input.leadId)) {
    return { ok: false, error: "Lead not found." };
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
  if (!lead) return { ok: false, error: "Lead not found." };

  if (
    !leadVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      lead: { ibId: lead.ibId, assignedAgentId: lead.assignedAgentId }
    })
  ) {
    return { ok: false, error: "You do not have access to this lead." };
  }

  if (lead.status === "unqualified" || lead.status === "duplicate") {
    return { ok: false, error: `Lead is ${lead.status} and cannot be converted.` };
  }

  const email = lead.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, error: "Lead email is invalid." };
  }

  const now = new Date();
  let investorId = lead.investorId;

  try {
    if (!investorId) {
      const [existing] = await db
        .select({ id: investors.id, assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
        .from(investors)
        .where(sql`lower(${investors.email}) = ${email}`)
        .limit(1);

      if (existing) {
        if (
          !investorVisibleToStaff({
            role: staff.role,
            staffId: staff.staff.id,
            investor: {
              assignedAgentId: existing.assignedAgentId,
              ibId: existing.ibId
            }
          })
        ) {
          return {
            ok: false,
            error: "An investor with this email already exists outside your book."
          };
        }
        investorId = existing.id;
      } else {
        const nameParts = lead.fullName.trim().split(/\s+/);
        const firstName = nameParts[0] || "Investor";
        const lastName = nameParts.slice(1).join(" ") || "—";

        const created = await db.transaction(async (tx) => {
          const [inv] = await tx
            .insert(investors)
            .values({
              authUserId: null,
              email,
              fullName: lead.fullName.trim() || email,
              phone: lead.phone,
              country: "",
              accountStatus: "pending_access",
              accountType: "individual",
              onboardingStatus: "started",
              kycStatus: "not_started",
              assignedAgentId: lead.assignedAgentId,
              ibId: lead.ibId,
              originalAgentId: lead.assignedAgentId,
              originalIbId: lead.ibId,
              termsAcceptedAt: now,
              riskAcceptedAt: now
            })
            .returning({ id: investors.id });
          if (!inv) throw new Error("INVESTOR_NOT_CREATED");

          await tx.insert(investorApplications).values({
            investorId: inv.id,
            accountType: "individual",
            firstName,
            lastName,
            email,
            phone: lead.phone || "—",
            countryOfResidence: "—",
            investmentProfile: { source: "lead_convert" },
            termsAcceptedAt: now,
            riskAcceptedAt: now,
            status: "submitted",
            leadId: lead.id
          });

          await tx
            .update(leads)
            .set({ investorId: inv.id, status: "converted", updatedAt: now })
            .where(and(eq(leads.id, lead.id)));

          await tx.insert(auditEvents).values({
            actorUserId: staff.user.id,
            action: "lead.converted_to_investor",
            entityType: "lead",
            entityId: lead.id,
            payload: { investorId: inv.id, email }
          });

          return inv.id;
        });
        investorId = created;
      }
    }

    if (!investorId) {
      return { ok: false, error: "Could not create investor." };
    }

    // Ensure an application exists when linking an existing investor.
    const [app] = await db
      .select({ id: investorApplications.id, status: investorApplications.status })
      .from(investorApplications)
      .where(eq(investorApplications.investorId, investorId))
      .limit(1);

    if (!app) {
      const nameParts = lead.fullName.trim().split(/\s+/);
      await db.insert(investorApplications).values({
        investorId,
        accountType: "individual",
        firstName: nameParts[0] || "Investor",
        lastName: nameParts.slice(1).join(" ") || "—",
        email,
        phone: lead.phone || "—",
        countryOfResidence: "—",
        investmentProfile: { source: "lead_convert" },
        termsAcceptedAt: now,
        riskAcceptedAt: now,
        status: "submitted",
        leadId: lead.id
      });
    }

    if (!lead.investorId) {
      await db
        .update(leads)
        .set({ investorId, status: "converted", updatedAt: now })
        .where(eq(leads.id, lead.id));
    }

    const invite = await approveAndInvite(investorId);
    if (!invite.ok) {
      return { ok: false, error: invite.error };
    }

    revalidatePath(`/admin/leads/lead/${lead.id}`);
    revalidatePath(`/admin/investors/${investorId}`);
    revalidatePath("/admin/leads");
    revalidatePath("/admin/investors");

    return {
      ok: true,
      investorId,
      inviteUrl: invite.inviteUrl,
      emailSent: invite.emailSent
    };
  } catch (error) {
    console.error("[leads:convertLeadToInvestorInvite]", error);
    return { ok: false, error: "Could not convert this lead. Please try again." };
  }
}

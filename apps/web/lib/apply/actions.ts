"use server";

import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/db/errors";
import { headers } from "next/headers";
import {
  auditEvents,
  db,
  investorApplications,
  investors,
  leads
} from "@/lib/db";
import { validateApplicationInput, type ApplicationInput } from "@/lib/apply/validation";
import { clientIpFromForwardedFor, ipThrottleAllows } from "@/lib/apply/ip-throttle";
import { sendTransactionalEmail } from "@/lib/email/send";
import { INVITE_SLA_COPY } from "@/lib/copy/posture";
import { ensureLeadListId } from "@/lib/leads/inbound-list";

export type SubmitApplicationResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

type PersistApplicationResult =
  | { ok: true; message: string; sendConfirmation: boolean }
  | { ok: false; error: string };

const APPLICATION_RECEIVED_MESSAGE = `Thanks — we have your application. ${INVITE_SLA_COPY}`;


/** postgres-js exposes constraint_name; node-pg style drivers use constraint. */
function violatedConstraint(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const e = error as { constraint?: string; constraint_name?: string };
  return e.constraint ?? e.constraint_name ?? "";
}

/**
 * True when the error is the same-email submission race: a concurrent request
 * won the insert on the investor email or lead investor unique index. The
 * leads_list_email_lower_uidx conflict is NOT a race — it is recovered by
 * adopting the pre-existing lead at the insert site in persistApplication, so
 * it never reaches here. When the driver omits the constraint name, any 23505
 * still reaching this point can only come from those two indexes (all other
 * writes key off freshly generated or existing ids).
 */
function isDuplicateSubmission(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const constraint = violatedConstraint(error);
  return (
    !constraint ||
    constraint === "investors_email_lower_uidx" ||
    constraint === "leads_investor_id_uidx"
  );
}

/**
 * Best-effort client IP for the secondary throttle; null when unavailable.
 * A null result deliberately passes the throttle (ipThrottleAllows): with no
 * trustworthy IP there is nothing sound to key the bucket on, and the
 * per-email DB cap below stays the authoritative limit.
 */
async function clientIp(): Promise<string | null> {
  try {
    const headerList = await headers();
    // Right-most XFF entry only — earlier entries are client-supplied and
    // would let a caller rotate the header past the throttle.
    return clientIpFromForwardedFor(headerList.get("x-forwarded-for"));
  } catch {
    // Outside a request scope (tests, scripts) — skip the IP throttle.
    return null;
  }
}

/** Confirmation email never blocks the submission; failures are logged only. */
async function sendApplicationConfirmation(data: ApplicationInput): Promise<void> {
  try {
    // Strip control characters (newlines etc.) so a crafted firstName cannot
    // inject extra lines or structure into the plain-text body.
    const firstName = data.firstName.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
    await sendTransactionalEmail({
      to: data.email,
      subject: "We received your Parkwise application",
      text: `Hi ${firstName},\n\nThanks — we have your application. ${INVITE_SLA_COPY} We'll email this address once we've reviewed it.\n\n— The Parkwise team\n\nCapital at risk.`
    });
  } catch (error) {
    console.error("[email:apply.confirmation]", error);
  }
}

async function persistApplication(data: ApplicationInput): Promise<PersistApplicationResult> {
  const now = new Date();

  const [existing] = await db
    .select()
    .from(investors)
    .where(sql`lower(${investors.email}) = ${data.email}`)
    .limit(1);

  // Keep every valid public response identical. Returning a different
  // error for an existing account would let an unauthenticated caller
  // enumerate account state by email.
  if (existing && existing.accountStatus !== "pending_access") {
    return {
      ok: true,
      sendConfirmation: false,
      message: APPLICATION_RECEIVED_MESSAGE
    };
  }

  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const profile = {
    ticketBand: data.ticketBand ?? null,
    goalsNote: data.goalsNote ?? null,
    opportunitySlug: data.opportunitySlug ?? null,
    opportunityOption: data.opportunityOption ?? null
  };

  if (existing && existing.accountStatus === "pending_access") {
    const [openApp] = await db
      .select()
      .from(investorApplications)
      .where(
        and(
          eq(investorApplications.investorId, existing.id),
          sql`${investorApplications.status} in ('submitted', 'contacted')`
        )
      )
      .limit(1);

    if (openApp) {
      // Idempotent no-op: resubmitting against an open application changes
      // nothing. This form is unauthenticated — anyone who knows the email
      // could otherwise rewrite the pending PII and re-stamp the consent
      // timestamps, unbounded by the per-email cap (it counts inserts only).
      // Keep this response byte-for-byte equivalent to the new-submission
      // response so the public form cannot enumerate application state.
      return {
        ok: true,
        sendConfirmation: false,
        message: APPLICATION_RECEIVED_MESSAGE
      };
    }
  }

  // All investor, lead, application, and audit writes below share one
  // transaction so a failure cannot leave a partial public submission behind.
  const sendConfirmation = await db.transaction(async (tx) => {
    let investorId = existing?.id;
    let lockedExistingLeadId: string | null = null;

    if (existing) {
      // Lead assignment flows lock leads before linked investors. Preserve that
      // order here so a concurrent reassignment cannot deadlock this request.
      const linkedLeads = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.investorId, existing.id))
        .orderBy(asc(leads.id))
        .for("update");
      lockedExistingLeadId = linkedLeads[0]?.id ?? null;

      const [lockedInvestor] = await tx
        .select({
          id: investors.id,
          accountStatus: investors.accountStatus
        })
        .from(investors)
        .where(eq(investors.id, existing.id))
        .limit(1)
        .for("update");

      // The preflight lookup is advisory. Recheck while holding the investor
      // lock so a stale pending page cannot overwrite an active account.
      if (!lockedInvestor || lockedInvestor.accountStatus !== "pending_access") {
        return false;
      }
      investorId = lockedInvestor.id;

      const applications = await tx
        .select({
          id: investorApplications.id,
          status: investorApplications.status
        })
        .from(investorApplications)
        .where(eq(investorApplications.investorId, lockedInvestor.id));

      if (
        applications.some(
          (application) =>
            application.status === "submitted" || application.status === "contacted"
        )
      ) {
        return false;
      }
    }
    if (!investorId) {
      const [created] = await tx
        .insert(investors)
        .values({
          authUserId: null,
          email: data.email,
          fullName,
          phone: data.phone,
          country: data.countryOfResidence,
          accountStatus: "pending_access",
          accountType: data.accountType,
          onboardingStatus: "started",
          kycStatus: "not_started",
          termsAcceptedAt: now,
          riskAcceptedAt: now
        })
        .returning();
      if (!created) throw new Error("Investor insert returned no row.");
      investorId = created.id;
    } else {
      await tx
        .update(investors)
        .set({
          fullName,
          phone: data.phone,
          country: data.countryOfResidence,
          accountStatus: "pending_access",
          accountType: data.accountType,
          termsAcceptedAt: now,
          riskAcceptedAt: now,
          updatedAt: now
        })
        .where(eq(investors.id, investorId));
    }

    // Provision the list inside the submission transaction. The helper's
    // idempotent list setup is not part of the public application row, while
    // every investor, lead, application, and audit write remains atomic.
    const listId = await ensureLeadListId("Inbound applications", "apply", tx);

    let leadId: string | null = null;
    if (listId) {
      if (lockedExistingLeadId) {
        leadId = lockedExistingLeadId;
        await tx
          .update(leads)
          .set({
            fullName,
            email: data.email,
            phone: data.phone,
            source: "apply",
            sourceDetail: data.accountType,
            updatedAt: now
          })
          .where(eq(leads.id, lockedExistingLeadId));
      } else {
        const [createdLead] = await tx
          .insert(leads)
          .values({
            listId,
            fullName,
            email: data.email,
            phone: data.phone,
            source: "apply",
            sourceDetail: data.accountType,
            investorId,
            // Created already linked, so it must not count as an active lead —
            // same linked⇒converted invariant as lib/leads/link.ts.
            status: "converted"
          })
          // Do not throw on the list/email race. A caught PostgreSQL unique
          // violation aborts the surrounding transaction before the winner can
          // be selected.
          .onConflictDoNothing()
          .returning();

        if (createdLead) {
          leadId = createdLead.id;
        } else {
          // A staff upload or concurrent submission already owns this
          // (list, lower(email)) key. Lock the winner before deciding whether
          // it is safe to adopt, keeping the transaction valid and preventing
          // a cross-investor lead link.
          const [preExisting] = await tx
            .select({ id: leads.id, investorId: leads.investorId })
            .from(leads)
            .where(
              and(eq(leads.listId, listId), sql`lower(${leads.email}) = ${data.email}`)
            )
            .limit(1)
            .for("update");

          if (!preExisting) {
            throw new Error("Lead conflict returned no row.");
          }

          if (preExisting.investorId && preExisting.investorId !== investorId) {
            // The unique list/email winner belongs to another investor. Never
            // point this application at that investor's lead.
            leadId = null;
          } else {
            if (!preExisting.investorId) {
              // Link only while still unlinked, preserving the
              // linked⇒converted invariant from lib/leads/link.ts.
              await tx
                .update(leads)
                .set({ investorId, status: "converted", updatedAt: now })
                .where(eq(leads.id, preExisting.id))
                .returning({ id: leads.id });
            }
            leadId = preExisting.id;
          }
        }
      }
    }

    const [app] = await tx
      .insert(investorApplications)
      .values({
        investorId,
        accountType: data.accountType,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        countryOfResidence: data.countryOfResidence,
        companyLegalName: data.companyLegalName ?? null,
        countryOfIncorporation: data.countryOfIncorporation ?? null,
        investmentProfile: profile,
        termsAcceptedAt: now,
        riskAcceptedAt: now,
        status: "submitted",
        leadId
      })
      .returning();
    if (!app) throw new Error("Application insert returned no row.");

    await tx.insert(auditEvents).values({
      actorUserId: "system:apply",
      action: "application.submitted",
      entityType: "investor",
      entityId: investorId,
      payload: { applicationId: app.id, email: data.email }
    });
    return true;
  });

  return {
    ok: true,
    sendConfirmation,
    message: APPLICATION_RECEIVED_MESSAGE
  };
}

export async function submitApplication(input: ApplicationInput): Promise<SubmitApplicationResult> {
  const validated = validateApplicationInput(input);
  if (!validated.ok) return validated;

  const data = validated.data;

  // Best-effort per-IP throttle first (process-local); the per-email DB cap
  // below stays the authoritative limit. Own bucket ("apply.submit") so
  // sign-in hint traffic from the same IP can't block applications.
  if (!ipThrottleAllows("apply.submit", await clientIp())) {
    return { ok: false, error: "Too many applications. Try again later." };
  }

  const recent = await db
    .select({ id: investorApplications.id })
    .from(investorApplications)
    .where(
      and(
        sql`lower(${investorApplications.email}) = ${data.email}`,
        gte(investorApplications.createdAt, new Date(Date.now() - 60 * 60 * 1000))
      )
    );
  if (recent.length >= 5) {
    // Do not turn the per-email cap into an existence oracle. The write is
    // skipped, but the public response remains the same as every valid
    // submission.
    return { ok: true, message: APPLICATION_RECEIVED_MESSAGE };
  }

  try {
    const result = await persistApplication(data);
    // Email only when a NEW investorApplications row was inserted. The
    // idempotent resubmit and the same-email race handled below write no new
    // row, so the public form cannot be used as an unauthenticated mail relay.
    if (!result.ok) return result;
    if (result.sendConfirmation) {
      await sendApplicationConfirmation(data);
    }
    return { ok: true, message: result.message };
  } catch (error) {
    if (isDuplicateSubmission(error)) {
      // Lost a same-email race — the concurrent request saved the application,
      // so answer with the same idempotent shape as the "already pending" path.
      return {
        ok: true,
        message: APPLICATION_RECEIVED_MESSAGE
      };
    }
    console.error("[apply:submit]", error);
    return { ok: false, error: "We couldn't submit your application just yet. Please try again, or contact the team if it continues." };
  }
}
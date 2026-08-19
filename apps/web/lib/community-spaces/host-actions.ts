"use server";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auditEvents, db, leads } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  clientIpFromForwardedFor,
  ipThrottleAllows
} from "@/lib/apply/ip-throttle";
import { sendTransactionalEmail } from "@/lib/email/send";
import { ensureLeadListId } from "@/lib/leads/inbound-list";
import {
  formatHostInterestNotes,
  validateHostInterest
} from "./host-interest";

export type HostInterestActionState =
  | null
  | { ok: true; message: string }
  | { ok: false; error: string };

async function clientIp(): Promise<string | null> {
  try {
    const headerList = await headers();
    return clientIpFromForwardedFor(headerList.get("x-forwarded-for"));
  } catch {
    return null;
  }
}

async function sendHostConfirmation(email: string, fullName: string): Promise<void> {
  try {
    const firstName = fullName.split(" ")[0] || "there";
    await sendTransactionalEmail({
      to: email,
      subject: "We received your parking-space details",
      text: `Hi ${firstName},\n\nThanks for telling Parkwise about your parking space. Our team will review the general location and contact details before anything is published. We will never publish an exact residential address from this request.\n\n— The Parkwise team`
    });
  } catch (error) {
    console.error("[email:community-host.confirmation]", error);
  }
}

export async function submitHostInterest(
  _previousState: HostInterestActionState,
  formData: FormData
): Promise<HostInterestActionState> {
  const validated = validateHostInterest(formData);
  if (!validated.ok) return validated;

  if (!ipThrottleAllows("community-host.submit", await clientIp())) {
    return { ok: false, error: "Too many requests. Try again later." };
  }

  const data = validated.data;
  const listId = await ensureLeadListId(
    "Community space hosts",
    "community_space_host"
  );
  if (!listId) {
    return {
      ok: false,
      error: "Host requests are temporarily unavailable. Please contact the team."
    };
  }

  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        eq(leads.listId, listId),
        sql`lower(${leads.email}) = ${data.email}`
      )
    )
    .limit(1);

  if (existing) {
    return {
      ok: true,
      message: "Thanks — your parking-space details are in review. The team will contact you before anything is published."
    };
  }

  const sourceDetail = [
    data.spaceType,
    [data.district, data.city, data.country].filter(Boolean).join(", ")
  ].join(" · ");

  try {
    await db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(leads)
        .values({
          listId,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          source: "community_space_host",
          sourceDetail,
          notes: formatHostInterestNotes(data),
          status: "new"
        })
        .returning({ id: leads.id });

      if (!lead) throw new Error("Host lead could not be created.");

      await tx.insert(auditEvents).values({
        actorUserId: "system:community-host",
        action: "community_host_interest.submitted",
        entityType: "lead",
        entityId: lead.id,
        payload: {
          spaceType: data.spaceType,
          city: data.city,
          country: data.country
        }
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
    return {
      ok: true,
      message: "Thanks — your parking-space details are in review. The team will contact you before anything is published."
    };
    }
    console.error("[community-host:submit]", error);
    return {
      ok: false,
      error: "We couldn't save your request just yet. Please try again."
    };
  }

  await sendHostConfirmation(data.email, data.fullName);
  revalidatePath("/admin/leads");

  return {
    ok: true,
    message: "Thanks — your parking-space details are in review. The team will contact you before anything is published."
  };
}

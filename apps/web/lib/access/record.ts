import { eq } from "drizzle-orm";
import { db, userAccessEvents } from "@/lib/db";
import { enrichIp } from "@/lib/access/enrich";
import { parseUserAgent } from "@/lib/access/ua";

export async function recordAccessEvent(input: {
  authUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId?: string | null;
}): Promise<void> {
  try {
    const ua = parseUserAgent(input.userAgent);
    const [row] = await db
      .insert(userAccessEvents)
      .values({
        authUserId: input.authUserId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        uaBrowser: ua.browser,
        uaOs: ua.os,
        uaDevice: ua.device,
        sessionId: input.sessionId ?? null,
        enrichmentStatus: "pending",
        enrichmentSource: "none"
      })
      .returning({ id: userAccessEvents.id });

    if (!row) return;

    const enriched = await enrichIp(input.ipAddress);
    await db
      .update(userAccessEvents)
      .set({
        countryCode: enriched.countryCode ?? null,
        countryName: enriched.countryName ?? null,
        region: enriched.region ?? null,
        city: enriched.city ?? null,
        timezone: enriched.timezone ?? null,
        isp: enriched.isp ?? null,
        org: enriched.org ?? null,
        isProxy: enriched.isProxy ?? null,
        isVpn: enriched.isVpn ?? null,
        isDatacenter: enriched.isDatacenter ?? null,
        enrichmentStatus: enriched.status,
        enrichmentSource: enriched.source,
        enrichmentRaw: enriched.raw ?? null
      })
      .where(eq(userAccessEvents.id, row.id));
  } catch (error) {
    console.error("[access] recordAccessEvent failed", error);
  }
}

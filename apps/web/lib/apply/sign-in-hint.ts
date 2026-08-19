"use server";

// NOTE: this read deliberately stays a server action. The sign-in page is a
// client component ("use client") and calls getSignInHint over RPC after a
// failed login; moving it to lib/apply/queries.ts would pull @/lib/db into
// the client bundle.

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, investors } from "@/lib/db";
import { clientIpFromForwardedFor, ipThrottleAllows } from "@/lib/apply/ip-throttle";
import { friendlySignInError } from "@/lib/auth/sign-in-errors";

/**
 * Best-effort client IP for the throttle; null when unavailable. A null result
 * deliberately passes the throttle (ipThrottleAllows): with no trustworthy IP
 * there is nothing sound to key the bucket on — the hint stays a best-effort
 * UX aid, and credential attempts themselves are rate-limited by better-auth
 * (see lib/auth/auth.ts).
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

/** Used when credentials fail — reveal pending application without confirming email exists for active users. */
export async function getSignInHint(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  // Throttled IPs get the same null as any non-pending email — a refused hint
  // must be indistinguishable from an absent one, or this endpoint becomes an
  // oracle amplifier for probing application status. Own bucket
  // ("apply.sign-in-hint"), separate from application submits.
  if (!ipThrottleAllows("apply.sign-in-hint", await clientIp())) return null;

  const [investor] = await db
    .select({ accountStatus: investors.accountStatus, authUserId: investors.authUserId })
    .from(investors)
    .where(sql`lower(${investors.email}) = ${normalized}`)
    .limit(1);

  if (investor?.accountStatus === "pending_access" && !investor.authUserId) {
    return "Your application is under review.";
  }
  return null;
}

/**
 * Error copy after a failed sign-in. A credential rate limit wins over the
 * pending-application hint: the hint fetch is skipped entirely, since
 * "under review" would otherwise mask "Too many attempts" for a pending
 * applicant who just hit the limit.
 */
export async function resolveSignInErrorMessage(
  email: string,
  error: { code?: string; message?: string }
): Promise<string> {
  if (error.code === "TOO_MANY_REQUESTS") return friendlySignInError(error);
  return (await getSignInHint(email)) ?? friendlySignInError(error);
}

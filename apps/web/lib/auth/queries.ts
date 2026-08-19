import { eq } from "drizzle-orm";
import { db, user } from "@/lib/db";

/**
 * Read-side data access against the auth (better-auth) tables. Plain module
 * (no "use server"): runs inside server pages only.
 */

/**
 * Fresh 2FA flag read from the user row: the session payload can predate an
 * enrollment or a break-glass reset within the same browser session.
 */
export async function isTwoFactorEnabledForUser(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ twoFactorEnabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.twoFactorEnabled === true;
}

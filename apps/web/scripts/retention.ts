import { config } from "dotenv";
import path from "node:path";
import { isNotNull, lt, or, type SQL } from "drizzle-orm";

config({ path: path.join(__dirname, "../.env.local") });
config({ path: path.join(__dirname, "../.env") });
import { createDb, inviteTokens, session, userAccessEvents, verification } from "../lib/db";

/**
 * Data-retention purge (GDPR). Deletes:
 *   - expired auth sessions
 *   - expired verification rows (password-reset / email-change tokens)
 *   - used or expired invite tokens
 *   - user_access_events older than RETENTION_DAYS (default 365 — the window
 *     stated in the privacy notice)
 *
 * Run with --dry-run to log counts without deleting. Scheduled via cron, e.g.:
 *   17 3 * * * cd /srv/parkwise/apps/web && npm run db:retention >> /var/log/parkwise-retention.log 2>&1
 */

const dryRun = process.argv.includes("--dry-run");
const retentionDays = Number.parseInt(process.env.RETENTION_DAYS ?? "365", 10);

async function main() {
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
    console.error(
      `retention: RETENTION_DAYS must be a positive integer, got "${process.env.RETENTION_DAYS}".`
    );
    process.exit(1);
  }

  const db = createDb();
  const now = new Date();
  const accessCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  type Target = {
    label: string;
    count: () => Promise<number>;
    purge: () => Promise<number>;
  };

  const targets: Target[] = [
    {
      label: "expired sessions",
      count: async () =>
        (await db.select({ id: session.id }).from(session).where(lt(session.expiresAt, now)))
          .length,
      purge: async () =>
        (await db.delete(session).where(lt(session.expiresAt, now)).returning({ id: session.id }))
          .length
    },
    {
      label: "expired verification rows",
      count: async () =>
        (
          await db
            .select({ id: verification.id })
            .from(verification)
            .where(lt(verification.expiresAt, now))
        ).length,
      purge: async () =>
        (
          await db
            .delete(verification)
            .where(lt(verification.expiresAt, now))
            .returning({ id: verification.id })
        ).length
    },
    {
      label: "used/expired invite tokens",
      count: async () =>
        (
          await db
            .select({ id: inviteTokens.id })
            .from(inviteTokens)
            .where(or(isNotNull(inviteTokens.usedAt), lt(inviteTokens.expiresAt, now)) as SQL)
        ).length,
      purge: async () =>
        (
          await db
            .delete(inviteTokens)
            .where(or(isNotNull(inviteTokens.usedAt), lt(inviteTokens.expiresAt, now)) as SQL)
            .returning({ id: inviteTokens.id })
        ).length
    },
    {
      label: `access events older than ${retentionDays} days`,
      count: async () =>
        (
          await db
            .select({ id: userAccessEvents.id })
            .from(userAccessEvents)
            .where(lt(userAccessEvents.occurredAt, accessCutoff))
        ).length,
      purge: async () =>
        (
          await db
            .delete(userAccessEvents)
            .where(lt(userAccessEvents.occurredAt, accessCutoff))
            .returning({ id: userAccessEvents.id })
        ).length
    }
  ];

  let total = 0;
  for (const target of targets) {
    const n = dryRun ? await target.count() : await target.purge();
    total += n;
    console.log(`retention${dryRun ? " (dry-run)" : ""}: ${dryRun ? "would delete" : "deleted"} ${n} ${target.label}`);
  }
  console.log(
    `retention${dryRun ? " (dry-run)" : ""}: ${dryRun ? "would delete" : "deleted"} ${total} rows in total.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-off: create local test accounts (ops super admin + demo investor) for QA/verifier.
 *
 * NEVER run this against production. Execution is gated behind the same demo-mode
 * guard as db:seed (lib/seed/guard.ts): it refuses to run when DEMO_MODE=false/0
 * unless CONFIRM_SEED=1. The shared password must be supplied via the
 * TEST_USER_PASSWORD env var — there is no default and no hardcoded credential.
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.join(__dirname, "../.env.local") });
config({ path: path.join(__dirname, "../.env") });

import { hashPassword } from "better-auth/crypto";
import { db, staffProfiles } from "@/lib/db";
import { user, account } from "@/lib/db/auth-schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { assertSeedAllowed } from "@/lib/seed/guard";

async function ensureUser(email: string, name: string, password: string) {
  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing) {
    console.log("exists:", email);
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name,
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const hashed = await hashPassword(password);
  await db.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: hashed,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  console.log("created:", email);
  return id;
}

async function main() {
  const gate = assertSeedAllowed();
  if (!gate.ok) {
    console.error("create-test-users:", gate.error);
    process.exit(1);
  }

  const password = (process.env.TEST_USER_PASSWORD ?? "").trim();
  if (!password) {
    console.error(
      "Refusing to run: TEST_USER_PASSWORD is not set. Supply a strong password via the TEST_USER_PASSWORD env var; this script has no default credential."
    );
    process.exit(1);
  }

  const opsId = await ensureUser("ops@parkwise.eu", "Ops Admin", password);
  await ensureUser("investor@example.com", "Demo Investor", password);

  // E2E flows that submit public host enquiries need a super-admin staff profile
  // (lib/leads/inbound-list.ts ensureLeadListId). Create it here so tests do not
  // depend on a prior ops sign-in to materialize the row.
  const now = new Date();
  await db
    .insert(staffProfiles)
    .values({
      authUserId: opsId,
      email: "ops@parkwise.eu",
      role: "super_admin",
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing();

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

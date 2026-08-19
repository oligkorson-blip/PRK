/**
 * One-off, idempotent backfill for the IB ownership model (migration 0014).
 *
 * The 'ib' enum value cannot be used inside the same transaction that adds it,
 * so this backfill runs as a script AFTER `db:migrate`, not as a drizzle migration.
 * Safe to run repeatedly.
 */
import { config } from "dotenv";
import path from "node:path";

config({ path: path.join(__dirname, "../.env.local") });
config({ path: path.join(__dirname, "../.env") });

import { sql } from "drizzle-orm";
import { createDb } from "../lib/db";

async function main() {
  const db = createDb();

  // 1) Placeholder IB when agents exist (super admins reassign teams later).
  await db.execute(sql`
    INSERT INTO staff_profiles (auth_user_id, email, role)
    SELECT 'system:default-ib', 'team@parkwise.internal', 'ib'
    WHERE EXISTS (SELECT 1 FROM staff_profiles WHERE role = 'agent')
      AND NOT EXISTS (SELECT 1 FROM staff_profiles WHERE auth_user_id = 'system:default-ib')
  `);

  // 2) Every existing agent inherits the placeholder IB.
  await db.execute(sql`
    UPDATE staff_profiles
    SET ib_id = (SELECT id FROM staff_profiles WHERE auth_user_id = 'system:default-ib'),
        updated_at = now()
    WHERE role = 'agent' AND ib_id IS NULL
      AND EXISTS (SELECT 1 FROM staff_profiles WHERE auth_user_id = 'system:default-ib')
  `);

  // 3) Leads inherit their agent's parent IB; assigned_at backfilled from updated_at.
  await db.execute(sql`
    UPDATE leads l
    SET ib_id = a.ib_id, assigned_at = l.updated_at
    FROM staff_profiles a
    WHERE l.assigned_agent_id = a.id AND l.ib_id IS NULL
  `);

  // 4) Converted leads reflect their status.
  await db.execute(sql`
    UPDATE leads SET status = 'converted' WHERE investor_id IS NOT NULL AND status = 'new'
  `);

  // 5) Investors: current IB + original attribution from the current assignment.
  await db.execute(sql`
    UPDATE investors i
    SET ib_id = a.ib_id,
        original_agent_id = i.assigned_agent_id,
        original_ib_id = a.ib_id
    FROM staff_profiles a
    WHERE i.assigned_agent_id = a.id AND i.ib_id IS NULL
  `);

  // 6) Seed the assignment audit trail for pre-existing assignments.
  await db.execute(sql`
    INSERT INTO lead_assignments (lead_id, actor_staff_id, action, from_ib_id, to_ib_id, from_agent_id, to_agent_id, note, created_at)
    SELECT l.id, NULL, 'assign_agent', NULL, l.ib_id, NULL, l.assigned_agent_id,
           'Seeded from pre-IB data', COALESCE(l.assigned_at, l.updated_at)
    FROM leads l
    WHERE l.assigned_agent_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM lead_assignments la WHERE la.lead_id = l.id)
  `);

  const [{ c: agentsLinked }] = await db.execute<{ c: string }>(sql`
    SELECT count(*)::text AS c FROM staff_profiles WHERE role = 'agent' AND ib_id IS NOT NULL
  `);
  const [{ c: leadsLinked }] = await db.execute<{ c: string }>(sql`
    SELECT count(*)::text AS c FROM leads WHERE ib_id IS NOT NULL
  `);
  console.log(`IB backfill complete: ${agentsLinked} agents linked, ${leadsLinked} leads with parent IB.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

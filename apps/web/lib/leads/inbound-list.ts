import { asc, eq } from "drizzle-orm";
import { db, leadLists, staffProfiles } from "@/lib/db";

type LeadListExecutor = Pick<typeof db, "select" | "insert">;

function selectLeadList(exec: LeadListExecutor, name: string) {
  return exec
    .select()
    .from(leadLists)
    .where(eq(leadLists.name, name))
    .orderBy(asc(leadLists.createdAt))
    .limit(1);
}

export async function ensureLeadListId(
  name: string,
  defaultSource: string,
  exec: LeadListExecutor = db
): Promise<string | null> {
  const [superAdmin] = await exec
    .select({ id: staffProfiles.id })
    .from(staffProfiles)
    .where(eq(staffProfiles.role, "super_admin"))
    .limit(1);
  if (!superAdmin) return null;

  const [existing] = await selectLeadList(exec, name);
  if (existing) return existing.id;

  // Use a conflict-safe insert instead of catching a unique violation inside
  // a transaction. A caught PostgreSQL constraint error would abort the
  // transaction before the winner lookup could run.
  const [created] = await exec
    .insert(leadLists)
    .values({
      name,
      defaultSource,
      createdByStaffId: superAdmin.id
    })
    .onConflictDoNothing()
    .returning({ id: leadLists.id });

  if (created) return created.id;

  const [winner] = await selectLeadList(exec, name);
  return winner?.id ?? null;
}

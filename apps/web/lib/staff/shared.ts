import { eq, sql } from "drizzle-orm";
import { isActiveStaff } from "@/lib/auth/roles";
import { db, staffProfiles, user } from "@/lib/db";

export type StaffActionResult = { ok: true } | { ok: false; error: string };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findAuthUserByEmail(email: string) {
  const [authUser] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);
  return authUser ?? null;
}

export async function loadIbOrError(ibStaffId: string): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const [ib] = await db
    .select({
      id: staffProfiles.id,
      role: staffProfiles.role,
      deactivatedAt: staffProfiles.deactivatedAt
    })
    .from(staffProfiles)
    .where(eq(staffProfiles.id, ibStaffId))
    .limit(1);
  if (!ib || ib.role !== "ib" || !isActiveStaff(ib)) {
    return { ok: false, error: "IB not found." };
  }
  return { ok: true, id: ib.id };
}

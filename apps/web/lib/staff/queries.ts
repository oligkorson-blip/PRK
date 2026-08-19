import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { StaffRole } from "@/lib/auth/roles";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { db, staffProfiles } from "@/lib/db";

/**
 * Read-side data access for staff administration. Plain module (no
 * "use server"): runs inside server pages only and is never registered as
 * RPC server actions.
 */

export type StaffRow = {
  id: string;
  email: string;
  role: StaffRole;
  authUserId: string;
  ibId: string | null;
  ibEmail: string | null;
  deactivatedAt: Date | null;
};

export type StaffDetail = {
  id: string;
  authUserId: string;
  email: string;
  role: StaffRole;
  ibId: string | null;
  ibEmail: string | null;
  deactivatedAt: Date | null;
  createdAt: Date;
};

export async function listStaff(): Promise<StaffRow[]> {
  await requireSuperAdmin();

  const ib = alias(staffProfiles, "ib");
  return db
    .select({
      id: staffProfiles.id,
      email: staffProfiles.email,
      role: staffProfiles.role,
      authUserId: staffProfiles.authUserId,
      ibId: staffProfiles.ibId,
      ibEmail: ib.email,
      deactivatedAt: staffProfiles.deactivatedAt
    })
    .from(staffProfiles)
    .leftJoin(ib, eq(staffProfiles.ibId, ib.id))
    .orderBy(asc(staffProfiles.email));
}

export async function getStaffDetailForSuperAdmin(
  staffId: string
): Promise<StaffDetail> {
  await requireSuperAdmin();

  const ib = alias(staffProfiles, "ib");
  const [profile] = await db
    .select({
      id: staffProfiles.id,
      authUserId: staffProfiles.authUserId,
      email: staffProfiles.email,
      role: staffProfiles.role,
      ibId: staffProfiles.ibId,
      ibEmail: ib.email,
      deactivatedAt: staffProfiles.deactivatedAt,
      createdAt: staffProfiles.createdAt
    })
    .from(staffProfiles)
    .leftJoin(ib, eq(staffProfiles.ibId, ib.id))
    .where(eq(staffProfiles.id, staffId))
    .limit(1);

  if (!profile) {
    throw new Error("NOT_FOUND");
  }

  return profile;
}

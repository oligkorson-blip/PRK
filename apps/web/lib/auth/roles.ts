export type StaffRole = "super_admin" | "ib" | "agent";

export function parseEmailList(envValue: string | undefined): Set<string> {
  const raw = envValue ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isSuperAdminEmail(email: string): boolean {
  const superRaw = process.env.SUPER_ADMIN_EMAILS;
  const raw =
    superRaw !== undefined && superRaw.trim() !== ""
      ? superRaw
      : process.env.ADMIN_EMAILS;
  return parseEmailList(raw).has(email.trim().toLowerCase());
}

/**
 * Startup guard: when SUPER_ADMIN_EMAILS is unset, isSuperAdminEmail silently
 * falls back to ADMIN_EMAILS (kept to avoid lockout). Warn loudly whenever the
 * fallback is actually granting super admin, so the implicit grant shows up in
 * logs; set SUPER_ADMIN_EMAILS explicitly to silence it.
 */
export function warnIfSuperAdminFallback(
  env: Record<string, string | undefined> = process.env,
  warn: (message: string) => void = console.warn
): void {
  const superRaw = env.SUPER_ADMIN_EMAILS;
  if (superRaw !== undefined && superRaw.trim() !== "") return;
  const adminRaw = env.ADMIN_EMAILS;
  if (adminRaw === undefined || adminRaw.trim() === "") return;
  warn(
    "SUPER_ADMIN_EMAILS is unset: ADMIN_EMAILS is granting super-admin access via the lockout fallback. Set SUPER_ADMIN_EMAILS explicitly."
  );
}

export function effectiveStaffRole(input: {
  email: string;
  dbRole: StaffRole | null;
}): StaffRole | null {
  if (isSuperAdminEmail(input.email)) return "super_admin";
  // SUPER_ADMIN_EMAILS is the sole authority for super admin: a persisted
  // super_admin row grants nothing once the email leaves the env list.
  if (input.dbRole === "super_admin") return null;
  return input.dbRole;
}

/** Deactivation does not block sign-in itself, but getStaffContext withholds staff context, so nothing may be assigned to them. */
export function isActiveStaff(profile: { deactivatedAt: Date | null }): boolean {
  return profile.deactivatedAt === null;
}

export function isAdminEmail(email: string): boolean {
  return isSuperAdminEmail(email);
}

export function isAdmin(user: { email: string } | null | undefined): boolean {
  if (!user?.email) return false;
  return effectiveStaffRole({ email: user.email, dbRole: null }) !== null;
}

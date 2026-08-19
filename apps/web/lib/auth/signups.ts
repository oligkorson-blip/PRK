/**
 * Better Auth email/password self-serve signup.
 * Apply-first: closed by default. Open only with one-time ALLOW_BOOTSTRAP_SIGNUP=true
 * for emails listed in SUPER_ADMIN_EMAILS (ops bootstrap). Public investors use /apply.
 */
import { parseEmailList } from "@/lib/auth/roles";

export function areSignupsDisabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.ALLOW_BOOTSTRAP_SIGNUP === "true") return false;
  return true;
}

/** When bootstrap signup is open, only SUPER_ADMIN_EMAILS (or ADMIN_EMAILS fallback) may register. */
export function isBootstrapSignupEmailAllowed(
  email: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (areSignupsDisabled(env)) return false;
  const superRaw = env.SUPER_ADMIN_EMAILS;
  const raw =
    superRaw !== undefined && superRaw.trim() !== "" ? superRaw : env.ADMIN_EMAILS;
  return parseEmailList(raw).has(email.trim().toLowerCase());
}

/**
 * Startup guard: the bootstrap escape hatch opens public signup (restricted
 * to SUPER_ADMIN_EMAILS). Warn loudly so a forgotten flag is visible in logs.
 */
export function warnIfBootstrapSignupOpen(
  env: Record<string, string | undefined> = process.env,
  warn: (message: string) => void = console.warn
): void {
  if (areSignupsDisabled(env)) return;
  warn(
    "ALLOW_BOOTSTRAP_SIGNUP=true: public signup is open (restricted to SUPER_ADMIN_EMAILS). Unset it after creating the first ops account."
  );
}

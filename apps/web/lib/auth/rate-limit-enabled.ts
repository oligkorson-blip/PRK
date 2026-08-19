/**
 * Credential-stuffing caps stay on unless AUTH_RATE_LIMIT is explicitly
 * "false" or "0" (case-insensitive, trimmed). Unset or any other value keeps
 * the Better Auth rules in lib/auth/auth.ts — fail-safe for production.
 *
 * The e2e job turns this off: Playwright shares one production server and
 * one loopback IP, so the /sign-in/email cap of 5/minute otherwise 429s
 * later specs.
 */
export function isAuthRateLimitEnabled(
  value: string | undefined = process.env.AUTH_RATE_LIMIT
): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v !== "false" && v !== "0";
}

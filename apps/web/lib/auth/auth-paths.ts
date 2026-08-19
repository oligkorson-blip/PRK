/**
 * Focused session pages render without the marketing header/footer
 * (components/site-header-gate.tsx and site-footer-gate.tsx).
 *
 * Includes the app/(auth) route group plus post-auth journey pages that use
 * the same chrome (onboarding, 2FA challenge, account security enrollment).
 * Keep URL paths stable — do not rename /two-factor (wired in authClient).
 */
export const AUTH_PATH_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/set-password",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/two-factor",
  "/account/security"
] as const;

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

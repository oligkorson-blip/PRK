/**
 * Staff 2FA expectation outside demo: enroll before using /admin.
 * Enrollment itself lives on portal settings (shared Better Auth UI).
 */
export function staffTwoFactorRequired(input: {
  demoMode: boolean;
  twoFactorEnabled: boolean;
  pathname: string;
}): boolean {
  if (input.demoMode) return false;
  if (input.twoFactorEnabled) return false;
  // Allow the shared enroll surface (portal settings) and auth routes.
  if (input.pathname.startsWith("/portal/settings")) return false;
  if (input.pathname.startsWith("/sign-")) return false;
  if (input.pathname.startsWith("/two-factor")) return false;
  return input.pathname.startsWith("/admin");
}

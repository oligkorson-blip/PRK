// Catalogue data is private. Keep this list aligned with the server-side gates
// in the pages themselves; the middleware is only the fast redirect layer.
const PROTECTED_PREFIXES = [
  "/portal",
  "/admin",
  "/onboarding",
  "/opportunities",
  "/spaces",
  "/help-me-choose"
] as const;
const SESSION_COOKIE_NAMES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
  "__Secure-better-auth-session_token",
  "better-auth-session_token"
] as const;

export function hasSessionCookie(cookies: { has(name: string): boolean }): boolean {
  return SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
}

export function requiresAuth(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function resolveAuthRedirect(input: {
  pathname: string;
  hasSessionCookie: boolean;
}): string | null {
  if (!requiresAuth(input.pathname)) return null;
  if (input.hasSessionCookie) return null;
  return "/sign-in";
}

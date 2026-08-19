/**
 * Better Auth returns raw error codes/messages; map the codes a user can act
 * on to friendly copy and hide everything else behind a generic fallback so
 * internal errors never reach the UI.
 */
const SIGN_IN_ERROR_FALLBACK = "We couldn’t sign you in. Check your details and try again, or contact the team.";

export function friendlySignInError(
  error: { code?: string; message?: string } | null
): string {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Incorrect email or password.";
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email address before signing in.";
    case "TOO_MANY_REQUESTS":
      return "Too many attempts. Wait a minute and try again.";
    default:
      return SIGN_IN_ERROR_FALLBACK;
  }
}
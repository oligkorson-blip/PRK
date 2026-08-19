import Link from "next/link";

/**
 * Optional, non-blocking nudge to enable 2FA. Shown on dashboards only —
 * never in the sign-in/registration path and never as a gate.
 */
export function TwoFactorOptionalBanner() {
  return (
    <p className="portal-banner stack-4">
      <strong>Optional:</strong> add two-factor authentication — about a minute.{" "}
      <Link href="/account/security">Set up authenticator</Link>
    </p>
  );
}

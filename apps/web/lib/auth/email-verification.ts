/**
 * Single source for "must an email address be verified before it can act?"
 *
 * The unclaimed-investor claim path (lib/auth/investor.ts) hands an entire
 * unclaimed investor row — KYC documents, interests, holdings — to whichever
 * account presents the matching email. That is only safe while every signup
 * path either requires verification or restricts which addresses may
 * register (bootstrap signup is limited to SUPER_ADMIN_EMAILS — see
 * lib/auth/signups.ts). This flag lives in its own dependency-free module so
 * tests/investor-claim-guard.test.ts can assert the invariant hermetically —
 * flip REQUIRE_EMAIL_VERIFICATION to true here if signup ever opens beyond
 * bootstrap, and wire sendVerificationEmail first so unverified addresses
 * cannot sign in.
 */
export const REQUIRE_EMAIL_VERIFICATION = false;

export function isEmailVerificationRequired(): boolean {
  return REQUIRE_EMAIL_VERIFICATION;
}

import { describe, expect, it } from "vitest";
import { isEmailVerificationRequired } from "@/lib/auth/email-verification";
import {
  areSignupsDisabled,
  isBootstrapSignupEmailAllowed
} from "@/lib/auth/signups";

/**
 * Tripwire for the unclaimed-investor claim path (lib/auth/investor.ts).
 *
 * claimUnclaimedInvestorByEmail hands an entire unclaimed investor row —
 * KYC documents, interests, holdings — to whichever signed-in account
 * presents the matching email. That is safe only while at least one of
 * these holds:
 *
 *   1. email verification is required (unverified addresses cannot act), or
 *   2. every open signup window restricts which addresses may register
 *      (today: bootstrap signup, limited to SUPER_ADMIN_EMAILS).
 *
 * If a future change opens signup to arbitrary addresses while verification
 * stays off, registering with a victim's email becomes a takeover of their
 * investor data — this test fails first.
 */
describe("investor claim guard", () => {
  it("an open signup window never admits arbitrary addresses while verification is off", () => {
    // Simulate the bootstrap window being open, as during first-ops-account
    // setup. areSignupsDisabled/isBootstrapSignupEmailAllowed take an env
    // override precisely so this can be exercised without mutating process.env.
    const bootstrapOpenEnv = {
      ALLOW_BOOTSTRAP_SIGNUP: "true",
      SUPER_ADMIN_EMAILS: "ops@example.com"
    };

    // Sanity: the simulation really is an open signup window.
    expect(areSignupsDisabled(bootstrapOpenEnv)).toBe(false);

    if (!isEmailVerificationRequired()) {
      // Verification off ⇒ the email allowlist is the only thing standing
      // between an attacker-chosen address and the claim path. It must hold.
      expect(isBootstrapSignupEmailAllowed("attacker@example.com", bootstrapOpenEnv)).toBe(
        false
      );
      expect(isBootstrapSignupEmailAllowed("ops@example.com", bootstrapOpenEnv)).toBe(true);
    }
  });

  it("signup stays closed by default", () => {
    // No bootstrap flag in a bare env ⇒ the apply-first model keeps public
    // self-registration closed regardless of the verification flag.
    expect(areSignupsDisabled({})).toBe(true);
  });
});

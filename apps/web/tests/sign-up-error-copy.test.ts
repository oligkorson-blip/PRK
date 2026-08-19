import { describe, expect, it, vi } from "vitest";

// signUpErrorMessage is exported from the client component for testability;
// stub the client-only imports so the module loads under the node environment.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({ authClient: {} }));

import { signUpErrorMessage } from "@/components/sign-up-form";

describe("signUpErrorMessage", () => {
  it("keeps the actionable bootstrap hint", () => {
    expect(
      signUpErrorMessage(
        "Bootstrap signup is limited to SUPER_ADMIN_EMAILS. Unset ALLOW_BOOTSTRAP_SIGNUP after the first ops account."
      )
    ).toBe(
      "Bootstrap signup is limited to emails listed in SUPER_ADMIN_EMAILS. Public investors should apply at /apply."
    );
  });

  it("hides raw better-auth strings behind generic copy", () => {
    const fallback = "We couldn’t create your account. Check your details and try again, or contact the team.";
    expect(signUpErrorMessage("User already exists")).toBe(fallback);
    expect(signUpErrorMessage("db error: duplicate key value violates unique constraint")).toBe(
      fallback
    );
    expect(signUpErrorMessage(undefined)).toBe(fallback);
  });
});
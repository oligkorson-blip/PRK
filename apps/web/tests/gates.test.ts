import { describe, expect, it } from "vitest";
import { canExpressInterest, isOnboardingComplete, requireCompletedOnboarding } from "@/lib/auth/gates";

const completed = {
  onboardingStatus: "completed",
  termsAcceptedAt: new Date(),
  riskAcceptedAt: new Date()
};

describe("isOnboardingComplete", () => {
  it("is true when status is completed and both acceptances are set", () => {
    expect(isOnboardingComplete(completed)).toBe(true);
  });

  it("is false when status is started", () => {
    expect(isOnboardingComplete({ ...completed, onboardingStatus: "started" })).toBe(false);
  });

  it("is false when termsAcceptedAt is null", () => {
    expect(isOnboardingComplete({ ...completed, termsAcceptedAt: null })).toBe(false);
  });

  it("is false when riskAcceptedAt is null", () => {
    expect(isOnboardingComplete({ ...completed, riskAcceptedAt: null })).toBe(false);
  });
});

describe("requireCompletedOnboarding", () => {
  it("does not throw when complete", () => {
    expect(() => requireCompletedOnboarding(completed)).not.toThrow();
  });

  it("throws when incomplete", () => {
    expect(() => requireCompletedOnboarding({ ...completed, onboardingStatus: "started" })).toThrow(
      "ONBOARDING_INCOMPLETE"
    );
  });
});

describe("canExpressInterest", () => {
  it("is true when onboarding complete and account active", () => {
    expect(canExpressInterest({ ...completed, accountStatus: "active" })).toBe(true);
  });

  it("is false when account is suspended", () => {
    expect(canExpressInterest({ ...completed, accountStatus: "suspended" })).toBe(false);
  });

  it("is false when onboarding incomplete", () => {
    expect(
      canExpressInterest({ ...completed, onboardingStatus: "started", accountStatus: "active" })
    ).toBe(false);
  });
});

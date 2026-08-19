export type OnboardingGateFields = {
  onboardingStatus: string;
  termsAcceptedAt: Date | null;
  riskAcceptedAt: Date | null;
};

export function isOnboardingComplete(investor: OnboardingGateFields): boolean {
  return (
    investor.onboardingStatus === "completed" &&
    investor.termsAcceptedAt != null &&
    investor.riskAcceptedAt != null
  );
}

export function requireCompletedOnboarding(investor: OnboardingGateFields): void {
  if (!isOnboardingComplete(investor)) {
    throw new Error("ONBOARDING_INCOMPLETE");
  }
}

export type InterestEligibilityFields = OnboardingGateFields & { accountStatus: string };

// The opportunity interest form is only shown once onboarding is complete
// and the account is in good standing (not suspended).
export function canExpressInterest(investor: InterestEligibilityFields): boolean {
  return isOnboardingComplete(investor) && investor.accountStatus === "active";
}

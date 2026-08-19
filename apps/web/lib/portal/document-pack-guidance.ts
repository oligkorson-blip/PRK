export type DocumentPackGuidance = {
  stage: "identity" | "browse" | "waiting" | "agreement" | "active";
  title: string;
  body: string;
  cta: string;
  href: string;
};

/** Empty-state guidance for the portal documents page by journey stage. */
export function documentPackGuidance(input: {
  kycStatus: string;
  pendingInterests: number;
  activeHoldings: number;
  openAgreements: number;
}): DocumentPackGuidance {
  if (input.kycStatus !== "approved") {
    return {
      stage: "identity",
      title: "Identity documents come first",
      body: "Upload your identity pack so the team can review it. Deal papers appear after confirmation.",
      cta: "Continue identity check",
      href: "/portal/kyc"
    };
  }
  if (input.activeHoldings > 0 && input.openAgreements === 0) {
    return {
      stage: "agreement",
      title: "Agreement coming next",
      body: "Your investment is confirmed. The team prepares the agreement — it will show under Agreements and here once ready.",
      cta: "Open agreements",
      href: "/portal/contracts"
    };
  }
  if (input.openAgreements > 0 || input.activeHoldings > 0) {
    return {
      stage: "active",
      title: "Your document pack",
      body: "Confirmed investments and signed agreements keep their files here. Talk to the team if something is missing.",
      cta: "View investments",
      href: "/portal/holdings"
    };
  }
  if (input.pendingInterests > 0) {
    return {
      stage: "waiting",
      title: "Waiting on confirmation",
      body: "Opportunity papers and agreements are prepared after the team confirms your request.",
      cta: "View requests",
      href: "/portal/interests"
    };
  }
  return {
    stage: "browse",
    title: "No documents yet",
    body: "Browse opportunities and register interest when ready. Documents for a place appear after confirmation.",
    cta: "View opportunities",
    href: "/opportunities"
  };
}

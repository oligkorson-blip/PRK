type StepState = "done" | "current" | "todo" | "blocked";

export type AccessTimelineStep = {
  id: string;
  label: string;
  detail: string;
  state: StepState;
  href?: string;
};

export function buildAccessTimeline(input: {
  applicationStatus: "submitted" | "contacted" | "approved" | "rejected" | null;
  accountStatus: string;
  kycStatus: string;
  pendingInterests: number;
  activeHoldings: number;
  /** Agreements in a non-terminal in-progress or effective state. */
  openAgreements?: number;
  /** True when a confirmed holding still needs an agreement prepared. */
  awaitingAgreement?: boolean;
}): AccessTimelineStep[] {
  const app = input.applicationStatus;
  const kyc = input.kycStatus;
  const appDone = app === "approved";
  const appRejected = app === "rejected";
  const accountLive = input.accountStatus === "active";
  const accountSuspended = input.accountStatus === "suspended";
  const kycDone = kyc === "approved";
  const kycRejected = kyc === "rejected";
  const openAgreements = input.openAgreements ?? 0;
  const awaitingAgreement = input.awaitingAgreement ?? false;

  let appState: StepState = "todo";
  if (appRejected) appState = "blocked";
  else if (appDone) appState = "done";
  else if (accountLive) appState = "done";
  else if (app === "submitted" || app === "contacted") appState = "current";

  let accountState: StepState = "todo";
  if (accountSuspended) accountState = "blocked";
  else if (accountLive) accountState = "done";
  else if (appDone) accountState = "current";
  else if (!appDone && !appRejected) accountState = "todo";

  let kycState: StepState = "todo";
  if (kycRejected) kycState = "blocked";
  else if (kycDone) kycState = "done";
  else if (accountLive) kycState = "current";

  let interestState: StepState = "todo";
  if (input.activeHoldings > 0 && input.pendingInterests === 0) interestState = "done";
  else if (input.pendingInterests > 0) interestState = kycDone ? "current" : "blocked";
  else if (kycDone) interestState = "current";

  let holdingState: StepState = "todo";
  if (input.activeHoldings > 0) holdingState = "done";
  else if (kycDone && input.pendingInterests > 0) {
    holdingState = "current";
  }

  let agreementState: StepState = "todo";
  if (openAgreements > 0) agreementState = "done";
  else if (awaitingAgreement || input.activeHoldings > 0) agreementState = "current";
  else if (kycDone && input.pendingInterests > 0) agreementState = "todo";

  return [
    {
      id: "application",
      label: "Application",
      detail: appRejected
        ? "The team could not approve this application. Contact us if you have questions."
        : appDone
          ? "Approved by the team."
          : accountLive
            ? "Portal access is live."
          : app === "contacted"
            ? "We've been in touch — decision coming soon."
            : app === "submitted"
              ? "Submitted — awaiting review."
              : "No open application on file.",
      state: appState,
      href: appRejected ? "/contact" : undefined
    },
    {
      id: "account",
      label: "Portal access",
      detail: accountSuspended
        ? "Please contact the team so we can help restore your access."
        : accountLive
          ? "Password set — you can sign in."
          : appDone
          ? "Invite sent — check your email for the set-password link."
          : "Available once your application is approved.",
      state: accountState,
      href: accountSuspended ? "/contact" : undefined
    },
    {
      id: "kyc",
      label: "Identity check",
      detail: kycRejected
        ? "Please upload updated documents so the team can review them again."
        : kycDone
          ? "Approved — you can invest when opportunities are open."
          : kyc === "under_review"
            ? "Under review by the team."
            : kyc === "submitted"
              ? "Documents submitted — awaiting review."
              : "Upload identity documents when ready.",
      state: kycState,
      href: "/portal/kyc"
    },
    {
      id: "interests",
      label: "Interest requests",
      detail:
        input.pendingInterests > 0
          ? kycDone
            ? `${input.pendingInterests} pending — waiting for team confirmation.`
            : `${input.pendingInterests} pending — complete your identity check so we can confirm.`
          : input.activeHoldings > 0
            ? "No open pending requests."
            : "Express interest from an opportunity page.",
      state: interestState,
      href: "/portal/interests"
    },
    {
      id: "investments",
      label: "Investments",
      detail:
        input.activeHoldings > 0
          ? `${input.activeHoldings} active investment${input.activeHoldings === 1 ? "" : "s"}.`
          : "We’ll add it here once your request and identity check are approved.",
      state: holdingState,
      href: "/portal/holdings"
    },
    {
      id: "agreements",
      label: "Agreements",
      detail:
        openAgreements > 0
          ? `${openAgreements} agreement${openAgreements === 1 ? "" : "s"} on file.`
          : awaitingAgreement || input.activeHoldings > 0
            ? "The team prepares an agreement after confirmation — it will appear here."
            : "Appears here when the team prepares one for you.",
      state: agreementState,
      href: "/portal/contracts"
    }
  ];
}

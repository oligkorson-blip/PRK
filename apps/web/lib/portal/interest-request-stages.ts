type StepState = "done" | "current" | "todo" | "blocked";

export type InterestRequestStage = {
  id: "submitted" | "identity" | "team_review" | "outcome";
  label: string;
  detail: string;
  state: StepState;
};

/**
 * Factual stages for one investment request — not advice, just where the
 * request sits in the ops pipeline.
 */
export function buildInterestRequestStages(input: {
  status: "pending" | "confirmed" | "declined" | "withdrawn" | string;
  kycStatus: string;
}): InterestRequestStage[] {
  const kycDone = input.kycStatus === "approved";
  const kycRejected = input.kycStatus === "rejected";
  const pending = input.status === "pending";
  const confirmed = input.status === "confirmed";
  const declined = input.status === "declined";
  const withdrawn = input.status === "withdrawn";

  let identityState: StepState = "todo";
  if (kycRejected) identityState = "blocked";
  else if (kycDone) identityState = "done";
  else if (pending) identityState = "current";

  let reviewState: StepState = "todo";
  if (confirmed || declined) reviewState = "done";
  else if (withdrawn) reviewState = "todo";
  else if (pending && !kycDone) reviewState = "blocked";
  else if (pending) reviewState = "current";

  let outcomeState: StepState = "todo";
  let outcomeLabel = "Outcome";
  let outcomeDetail = "Waiting for a team decision.";
  if (confirmed) {
    outcomeState = "done";
    outcomeLabel = "Confirmed";
    outcomeDetail = "Added to your investments.";
  } else if (declined) {
    outcomeState = "done";
    outcomeLabel = "Not progressed";
    outcomeDetail = "The team did not confirm this request.";
  } else if (withdrawn) {
    outcomeState = "done";
    outcomeLabel = "Withdrawn";
    outcomeDetail = "You withdrew this request.";
  }

  return [
    {
      id: "submitted",
      label: "Submitted",
      detail: "Request received.",
      state: "done"
    },
    {
      id: "identity",
      label: "Identity check",
      detail: kycRejected
        ? "Update documents so the team can review again."
        : kycDone
          ? "Approved."
          : input.kycStatus === "under_review" || input.kycStatus === "submitted"
            ? "Documents with the team."
            : "Finish identity checks so we can confirm.",
      state: identityState
    },
    {
      id: "team_review",
      label: "Team review",
      detail:
        confirmed || declined
          ? "Review finished."
          : pending && !kycDone
            ? "Starts after identity is approved."
            : "Waiting for the team.",
      state: reviewState
    },
    {
      id: "outcome",
      label: outcomeLabel,
      detail: outcomeDetail,
      state: outcomeState
    }
  ];
}

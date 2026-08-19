export const CONTRACT_STATES = [
  "ready_to_review",
  "summary_viewed",
  "agreement_viewed",
  "investor_signed",
  "counter_signature_pending",
  "effective",
  "signed_documents_available",
  "superseded",
  "withdrawn"
] as const;

export type ContractState = (typeof CONTRACT_STATES)[number];

export const CONTRACT_STATE_LABEL: Record<ContractState, string> = {
  ready_to_review: "Ready to review",
  summary_viewed: "Summary viewed",
  agreement_viewed: "Agreement viewed",
  investor_signed: "Signed by you",
  counter_signature_pending: "Awaiting final signature",
  effective: "Effective",
  signed_documents_available: "Signed documents ready",
  superseded: "Superseded",
  withdrawn: "Withdrawn"
};

/**
 * State transitions that are safe to expose to application services.
 * Viewed states are informational and may be reached from any active review state.
 * Effectiveness is only reachable after the explicit counter-signature state.
 */
const ALLOWED_TRANSITIONS: Record<ContractState, readonly ContractState[]> = {
  ready_to_review: ["summary_viewed", "agreement_viewed", "withdrawn", "superseded"],
  summary_viewed: ["agreement_viewed", "investor_signed", "withdrawn", "superseded"],
  agreement_viewed: ["summary_viewed", "investor_signed", "withdrawn", "superseded"],
  investor_signed: ["counter_signature_pending", "withdrawn", "superseded"],
  counter_signature_pending: ["effective", "withdrawn", "superseded"],
  effective: ["signed_documents_available", "superseded"],
  signed_documents_available: ["superseded"],
  superseded: [],
  withdrawn: []
};

export function canTransitionContract(from: ContractState, to: ContractState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function contractStateLabel(state: ContractState): string {
  return CONTRACT_STATE_LABEL[state];
}

export function nextContractAction(state: ContractState): string {
  switch (state) {
    case "ready_to_review":
    case "summary_viewed":
      return "Review the agreement summary";
    case "agreement_viewed":
      return "Sign when you are ready";
    case "investor_signed":
    case "counter_signature_pending":
      return "Park is completing the final signature";
    case "effective":
      return "Wait for signed copies to be ready";
    case "signed_documents_available":
      return "Download your signed documents";
    case "superseded":
      return "Review the newer agreement";
    case "withdrawn":
      return "Contact us if you have questions";
  }
}

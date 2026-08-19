import type { KycCheckResult } from "./validation";

/**
 * Per-investor AML state for the admin checklist.
 * `blocking` = KYC approved but no screening recorded — confirmInterest will
 * refuse until the LATEST kyc_checks row is `clear` (see latestScreeningResult
 * in lib/aml/queries.ts, which the confirm gate shares with this checklist).
 */
export type AmlChecklistState = "clear" | "flagged" | "blocking" | "awaiting_screening";

export function amlChecklistState(input: {
  kycStatus: "not_started" | "submitted" | "under_review" | "approved" | "rejected";
  latestResult: KycCheckResult | null;
}): AmlChecklistState {
  if (input.latestResult === "clear") return "clear";
  if (input.latestResult === "review" || input.latestResult === "rejected") return "flagged";
  if (input.kycStatus === "approved") return "blocking";
  return "awaiting_screening";
}

/** Severity order for the admin checklist: blocking first, clear last. */
const STATE_SEVERITY: Record<AmlChecklistState, number> = {
  blocking: 0,
  awaiting_screening: 1,
  flagged: 2,
  clear: 3
};

/**
 * Sort + filter the admin AML checklist by state severity (blocking →
 * awaiting → flagged → clear). Stable: rows keep their existing (email)
 * order within a state, and the input array is never mutated. Pure.
 */
export function triageAmlChecklist<T>(
  rows: readonly T[],
  stateOf: (row: T) => AmlChecklistState,
  filter?: AmlChecklistState | null
): T[] {
  const visible = filter ? rows.filter((row) => stateOf(row) === filter) : [...rows];
  return visible.sort((a, b) => STATE_SEVERITY[stateOf(a)] - STATE_SEVERITY[stateOf(b)]);
}

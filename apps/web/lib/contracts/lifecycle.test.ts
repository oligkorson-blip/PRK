import { describe, expect, it } from "vitest";
import {
  canTransitionContract,
  contractStateLabel,
  nextContractAction,
  type ContractState
} from "./lifecycle";

describe("contract lifecycle", () => {
  it("requires the counter-signature before a contract becomes effective", () => {
    expect(canTransitionContract("investor_signed", "effective")).toBe(false);
    expect(canTransitionContract("investor_signed", "counter_signature_pending")).toBe(true);
    expect(canTransitionContract("counter_signature_pending", "effective")).toBe(true);
    expect(canTransitionContract("agreement_viewed", "effective")).toBe(false);
  });

  it("does not allow terminal states to transition", () => {
    expect(canTransitionContract("withdrawn", "ready_to_review")).toBe(false);
    expect(canTransitionContract("superseded", "effective")).toBe(false);
  });

  it("keeps labels and next actions human-readable", () => {
    const states: ContractState[] = ["ready_to_review", "investor_signed", "effective"];
    expect(states.map(contractStateLabel)).toEqual([
      "Ready to review",
      "Signed by you",
      "Effective"
    ]);
    expect(nextContractAction("counter_signature_pending")).toContain("final signature");
  });
});
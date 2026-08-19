import { describe, expect, it } from "vitest";
import { amlChecklistState, triageAmlChecklist, type AmlChecklistState } from "./state";

describe("amlChecklistState", () => {
  it("is clear when the latest screening is clear, regardless of KYC status", () => {
    expect(amlChecklistState({ kycStatus: "approved", latestResult: "clear" })).toBe("clear");
    expect(amlChecklistState({ kycStatus: "submitted", latestResult: "clear" })).toBe("clear");
  });

  it("is flagged when the latest screening needs review or was rejected", () => {
    expect(amlChecklistState({ kycStatus: "approved", latestResult: "review" })).toBe("flagged");
    expect(amlChecklistState({ kycStatus: "approved", latestResult: "rejected" })).toBe("flagged");
    expect(amlChecklistState({ kycStatus: "under_review", latestResult: "review" })).toBe("flagged");
  });

  it("is blocking when KYC is approved but no screening is on record", () => {
    expect(amlChecklistState({ kycStatus: "approved", latestResult: null })).toBe("blocking");
  });

  it("is awaiting screening when KYC is not approved and nothing is on record", () => {
    expect(amlChecklistState({ kycStatus: "not_started", latestResult: null })).toBe(
      "awaiting_screening"
    );
    expect(amlChecklistState({ kycStatus: "submitted", latestResult: null })).toBe(
      "awaiting_screening"
    );
    expect(amlChecklistState({ kycStatus: "rejected", latestResult: null })).toBe(
      "awaiting_screening"
    );
  });
});

describe("triageAmlChecklist", () => {
  const rows: { id: string; state: AmlChecklistState }[] = [
    { id: "clear-1", state: "clear" },
    { id: "flagged-1", state: "flagged" },
    { id: "awaiting-1", state: "awaiting_screening" },
    { id: "blocking-1", state: "blocking" },
    { id: "blocking-2", state: "blocking" },
    { id: "awaiting-2", state: "awaiting_screening" }
  ];
  const stateOf = (row: { state: AmlChecklistState }) => row.state;
  const ids = (list: { id: string }[]) => list.map((row) => row.id);

  it("sorts blocking → awaiting → flagged → clear", () => {
    expect(ids(triageAmlChecklist(rows, stateOf))).toEqual([
      "blocking-1",
      "blocking-2",
      "awaiting-1",
      "awaiting-2",
      "flagged-1",
      "clear-1"
    ]);
  });

  it("keeps the original order within a state (stable sort)", () => {
    expect(ids(triageAmlChecklist(rows, stateOf)).slice(0, 2)).toEqual([
      "blocking-1",
      "blocking-2"
    ]);
  });

  it("filters to a single state when a filter is given", () => {
    expect(ids(triageAmlChecklist(rows, stateOf, "blocking"))).toEqual([
      "blocking-1",
      "blocking-2"
    ]);
    expect(ids(triageAmlChecklist(rows, stateOf, "clear"))).toEqual(["clear-1"]);
    expect(triageAmlChecklist(rows, stateOf, "flagged")).toHaveLength(1);
  });

  it("does not mutate the input array", () => {
    const before = ids(rows);
    triageAmlChecklist(rows, stateOf);
    expect(ids(rows)).toEqual(before);
  });
});

import { describe, expect, it } from "vitest";
import {
  LEAD_CALL_OUTCOMES,
  isLeadCallOutcome,
  leadCallOutcomeLabel,
  parseLeadCallOutcome,
  type LeadCallOutcome
} from "@/lib/leads/outcomes";

describe("LEAD_CALL_OUTCOMES", () => {
  it("lists the seven outcome values", () => {
    expect(LEAD_CALL_OUTCOMES).toEqual([
      "no_answer",
      "reached",
      "interested",
      "not_interested",
      "callback",
      "wrong_number",
      "other"
    ]);
  });
});

describe("isLeadCallOutcome", () => {
  it("accepts each known outcome", () => {
    for (const outcome of LEAD_CALL_OUTCOMES) {
      expect(isLeadCallOutcome(outcome)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isLeadCallOutcome("")).toBe(false);
    expect(isLeadCallOutcome("No Answer")).toBe(false);
    expect(isLeadCallOutcome("busy")).toBe(false);
  });
});

describe("parseLeadCallOutcome", () => {
  it("parses valid outcomes", () => {
    expect(parseLeadCallOutcome("interested")).toBe("interested");
    expect(parseLeadCallOutcome("wrong_number")).toBe("wrong_number");
  });

  it("returns null for invalid values", () => {
    expect(parseLeadCallOutcome(null)).toBeNull();
    expect(parseLeadCallOutcome(undefined)).toBeNull();
    expect(parseLeadCallOutcome(1)).toBeNull();
    expect(parseLeadCallOutcome({})).toBeNull();
    expect(parseLeadCallOutcome("Interested")).toBeNull();
    expect(parseLeadCallOutcome("busy")).toBeNull();
  });
});

describe("leadCallOutcomeLabel", () => {
  it("provides an English label for every outcome", () => {
    const labels: Record<LeadCallOutcome, string> = {
      no_answer: leadCallOutcomeLabel("no_answer"),
      reached: leadCallOutcomeLabel("reached"),
      interested: leadCallOutcomeLabel("interested"),
      not_interested: leadCallOutcomeLabel("not_interested"),
      callback: leadCallOutcomeLabel("callback"),
      wrong_number: leadCallOutcomeLabel("wrong_number"),
      other: leadCallOutcomeLabel("other")
    };

    expect(labels).toEqual({
      no_answer: "No answer",
      reached: "Reached",
      interested: "Interested",
      not_interested: "Not interested",
      callback: "Callback",
      wrong_number: "Wrong number",
      other: "Other"
    });

    for (const outcome of LEAD_CALL_OUTCOMES) {
      expect(leadCallOutcomeLabel(outcome).trim().length).toBeGreaterThan(0);
    }
  });
});

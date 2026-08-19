import { describe, expect, it } from "vitest";
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_OPTIONS,
  LEAD_STATUS_VALUES,
  TERMINAL_LEAD_STATUSES
} from "@/lib/leads/labels";

describe("lead status labels", () => {
  it("labels every schema status (no raw enum strings in UI)", () => {
    for (const value of LEAD_STATUS_VALUES) {
      expect(LEAD_STATUS_LABEL[value]).toBeTruthy();
      expect(LEAD_STATUS_LABEL[value]).not.toBe(value);
    }
    expect(LEAD_STATUS_OPTIONS).toHaveLength(LEAD_STATUS_VALUES.length);
  });

  it("marks exactly unqualified/duplicate/converted as terminal", () => {
    expect([...TERMINAL_LEAD_STATUSES].sort()).toEqual([
      "converted",
      "duplicate",
      "unqualified"
    ]);
  });
});

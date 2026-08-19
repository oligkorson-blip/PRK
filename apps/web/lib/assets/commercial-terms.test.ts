import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_TERM_IDS,
  COMMERCIAL_TERM_LABELS,
  COMMERCIAL_TERM_NOT_MEANING,
  DEFAULT_COMMERCIAL_TERM_IDS,
  keyTermsStructureSummary
} from "@/lib/assets/commercial-terms";

describe("commercial terms catalogue", () => {
  it("has a label and not-meaning line for every term id", () => {
    for (const id of COMMERCIAL_TERM_IDS) {
      expect(COMMERCIAL_TERM_LABELS[id].length).toBeGreaterThan(0);
      expect(COMMERCIAL_TERM_NOT_MEANING[id].length).toBeGreaterThan(0);
    }
  });

  it("joins term labels for the Key terms structure row", () => {
    const summary = keyTermsStructureSummary(DEFAULT_COMMERCIAL_TERM_IDS);
    expect(summary).toBe(
      "Operator lease structure · Target income from operator rent · " +
        "Indexation where stated in the lease · Investor protections in the deal terms · " +
        "Flexible terms where offered"
    );
  });

  it("returns an empty string for no terms", () => {
    expect(keyTermsStructureSummary([])).toBe("");
  });
});

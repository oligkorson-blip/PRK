import { describe, expect, it } from "vitest";
import {
  CHOOSER_ILLUSTRATIVE_DISCLAIMER,
  CHOOSER_NON_ADVISORY_LINE,
  GUIDE_ILLUSTRATIVE_DISCLAIMER,
  ILLUSTRATION_ASSUMPTIONS,
  PORTAL_WITHDRAWAL_CONFIRMATION,
  PORTAL_WITHDRAWAL_ERROR,
  PORTAL_WITHDRAWAL_UNAVAILABLE
} from "@/lib/copy/consumer";

describe("PORTAL_WITHDRAWAL_ACTION_COPY", () => {
  it("keeps the confirmation factual and the recovery path clear", () => {
    expect(PORTAL_WITHDRAWAL_CONFIRMATION).toBe(
      "You can keep this request active or withdraw it now. A withdrawal cannot be reversed."
    );
    expect(PORTAL_WITHDRAWAL_ERROR).toBe(
      "We couldn't complete that withdrawal just yet. Please try again, or contact the team if it continues."
    );
  });
});

describe("PORTAL_WITHDRAWAL_UNAVAILABLE", () => {
  it("gives account-state guidance with a clear team path", () => {
    expect(PORTAL_WITHDRAWAL_UNAVAILABLE).toBe(
      "Withdrawals are currently unavailable for this account. Talk to the team if you have questions."
    );
  });
});

describe("ILLUSTRATION_ASSUMPTIONS", () => {
  it("states the gross-of-tax, before-costs, target basis", () => {
    expect(ILLUSTRATION_ASSUMPTIONS).toContain("gross of tax");
    expect(ILLUSTRATION_ASSUMPTIONS).toContain("before any costs");
    expect(ILLUSTRATION_ASSUMPTIONS.toLowerCase()).toContain("target");
  });
});

describe("GUIDE_ILLUSTRATIVE_DISCLAIMER", () => {
  it("marks guides as illustrative, not a live offering, with capital at risk", () => {
    expect(GUIDE_ILLUSTRATIVE_DISCLAIMER).toContain("illustrative");
    expect(GUIDE_ILLUSTRATIVE_DISCLAIMER).toContain("not a live investment offering");
    expect(GUIDE_ILLUSTRATIVE_DISCLAIMER).toContain("Capital at risk");
    expect(GUIDE_ILLUSTRATIVE_DISCLAIMER).not.toContain("'");
  });
});

describe("CHOOSER_ILLUSTRATIVE_DISCLAIMER", () => {
  it("exposes chooser disclaimer without apostrophes", () => {
    expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER).toContain("illustrative");
    expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER).toContain("not a live investment offering");
    expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER).toContain("Capital at risk");
    expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER).not.toContain("'");
    expect(CHOOSER_ILLUSTRATIVE_DISCLAIMER.toLowerCase()).not.toContain("guide is");
  });
});

describe("CHOOSER_NON_ADVISORY_LINE", () => {
  it("states matches are not personal recommendations", () => {
    expect(CHOOSER_NON_ADVISORY_LINE.toLowerCase()).toMatch(
      /not a personal recommendation|not personal advice|preference/
    );
    expect(CHOOSER_NON_ADVISORY_LINE).not.toContain("'");
    expect(CHOOSER_NON_ADVISORY_LINE.toLowerCase()).not.toMatch(
      /suitable|best for you|recommended for you/
    );
  });
});
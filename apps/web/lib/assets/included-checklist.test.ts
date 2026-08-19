import { describe, expect, it } from "vitest";
import { buildIncludedChecklist } from "@/lib/assets/included-checklist";
import { COMMERCIAL_TERM_NOT_MEANING } from "@/lib/assets/commercial-terms";
import { MISSING_TERM } from "@/lib/assets/presentation";

describe("buildIncludedChecklist", () => {
  it("lists each known term with its not-meaning qualifier", () => {
    const items = buildIncludedChecklist({
      termIds: ["triple_net", "contractual_monthly_rent"],
      termDisplay: "5 years",
      paymentFrequencyDisplay: "Monthly"
    });
    expect(items[0]).toEqual({
      id: "term-triple_net",
      text: "Operator lease structure",
      hint: COMMERCIAL_TERM_NOT_MEANING.triple_net
    });
    expect(items[1]).toEqual({
      id: "term-contractual_monthly_rent",
      text: "Target income from operator rent",
      hint: COMMERCIAL_TERM_NOT_MEANING.contractual_monthly_rent
    });
  });

  it("skips unknown term ids rather than inventing claims", () => {
    const items = buildIncludedChecklist({
      termIds: ["made_up_term"],
      termDisplay: "5 years",
      paymentFrequencyDisplay: "Monthly"
    });
    expect(items.some((i) => i.id.startsWith("term-made_up"))).toBe(false);
  });

  it("adds monthly distributions only when payments are monthly, with a target qualifier", () => {
    const monthly = buildIncludedChecklist({
      termIds: [],
      termDisplay: "5 years",
      paymentFrequencyDisplay: "Monthly"
    });
    const dist = monthly.find((i) => i.id === "monthly-distributions");
    expect(dist?.text).toContain("monthly");
    expect(dist?.hint).toContain("target, not a guarantee");

    const other = buildIncludedChecklist({
      termIds: [],
      termDisplay: "5 years",
      paymentFrequencyDisplay: "See opportunity details"
    });
    expect(other.some((i) => i.id === "monthly-distributions")).toBe(false);
  });

  it("omits the term line when the term is missing, and always closes on the exit line", () => {
    const missing = buildIncludedChecklist({
      termIds: [],
      termDisplay: MISSING_TERM,
      paymentFrequencyDisplay: "Monthly"
    });
    expect(missing.some((i) => i.id === "term")).toBe(false);
    expect(missing[missing.length - 1]?.id).toBe("exit");

    const present = buildIncludedChecklist({
      termIds: [],
      termDisplay: "7 years",
      paymentFrequencyDisplay: "Monthly"
    });
    expect(present.find((i) => i.id === "term")?.text).toBe("Term: 7 years");
  });

  it("never makes guarantee claims", () => {
    const items = buildIncludedChecklist({
      termIds: ["contractual_monthly_rent", "buyback_at_par", "parkwise_protections"],
      termDisplay: "5 years",
      paymentFrequencyDisplay: "Monthly"
    });
    for (const item of items) {
      expect(item.text).not.toMatch(/guaranteed/i);
    }
  });
});

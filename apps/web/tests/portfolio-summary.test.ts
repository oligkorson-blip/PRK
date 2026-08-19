import { describe, expect, it } from "vitest";
import { annualTargetIncomeEur, totalCommittedEur } from "@/lib/portfolio/summary";

describe("annualTargetIncomeEur", () => {
  it("sums amount * yield / 100 rounded to nearest euro", () => {
    expect(annualTargetIncomeEur([{ amountEur: 10000, targetYieldPct: 8 }])).toBe(800);
    expect(annualTargetIncomeEur([{ amountEur: 10000, targetYieldPct: "8.40" }])).toBe(840);
  });
  it("rounds a .5 boundary up (Math.round)", () => {
    expect(annualTargetIncomeEur([{ amountEur: 100, targetYieldPct: 0.5 }])).toBe(1);
    expect(annualTargetIncomeEur([{ amountEur: 250, targetYieldPct: 1 }])).toBe(3);
  });
  it("skips holdings whose yield is not a finite number", () => {
    expect(
      annualTargetIncomeEur([
        { amountEur: 10000, targetYieldPct: "not-a-number" },
        { amountEur: 10000, targetYieldPct: "Infinity" },
        { amountEur: 10000, targetYieldPct: "8" },
      ])
    ).toBe(800);
  });
  it("returns 0 for empty", () => {
    expect(annualTargetIncomeEur([])).toBe(0);
  });
});

describe("totalCommittedEur", () => {
  it("sums amounts", () => {
    expect(totalCommittedEur([{ amountEur: 1000 }, { amountEur: 2500 }])).toBe(3500);
  });
});

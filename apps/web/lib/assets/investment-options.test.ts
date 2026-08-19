import { describe, expect, it } from "vitest";
import {
  formatYieldCeiling,
  illustratorDownsideRows,
  optionAnnualIncome,
  optionDerivedLabels,
  optionMonthlyIncome,
  validateInvestmentOptions,
  type InvestmentOption
} from "@/lib/assets/investment-options";
import { DEFAULT_COMMERCIAL_TERM_IDS } from "@/lib/assets/commercial-terms";

describe("investment options math", () => {
  it("computes annual and monthly from ticket × yield", () => {
    expect(optionAnnualIncome(11400, 7.8)).toBe(889);
    expect(optionMonthlyIncome(889)).toBe(74);
  });

  it("accepts a valid standard + premium set", () => {
    const annual = optionAnnualIncome(10000, 8);
    const monthly = optionMonthlyIncome(annual);
    const premiumAnnual = optionAnnualIncome(25000, 9.5);
    const result = validateInvestmentOptions(
      [
        {
          id: "standard",
          label: "Standard option",
          recommended: true,
          minTicketEur: 10000,
          yieldPct: 8,
          monthlyIncomeEur: monthly,
          annualIncomeEur: annual,
          commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
        },
        {
          id: "premium",
          label: "Premium option",
          recommended: false,
          minTicketEur: 25000,
          yieldPct: 9.5,
          monthlyIncomeEur: optionMonthlyIncome(premiumAnnual),
          annualIncomeEur: premiumAnnual,
          commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
        }
      ],
      { mix: [{ id: "vehicle_parking", pct: 100 }] }
    );
    expect(result.ok).toBe(true);
  });

  it("rejects green without EV story", () => {
    const annual = optionAnnualIncome(10000, 8);
    const greenAnnual = optionAnnualIncome(20000, 10);
    const result = validateInvestmentOptions(
      [
        {
          id: "standard",
          label: "Standard option",
          recommended: true,
          minTicketEur: 10000,
          yieldPct: 8,
          monthlyIncomeEur: optionMonthlyIncome(annual),
          annualIncomeEur: annual,
          commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
        },
        {
          id: "green",
          label: "EV option",
          recommended: false,
          minTicketEur: 20000,
          yieldPct: 10,
          monthlyIncomeEur: optionMonthlyIncome(greenAnnual),
          annualIncomeEur: greenAnnual,
          commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
        }
      ],
      { mix: [{ id: "vehicle_parking", pct: 100 }] }
    );
    expect(result.ok).toBe(false);
  });

  it("rejects buyback when BUYBACK_FUNDED is not set (CRO R3)", () => {
    const annual = optionAnnualIncome(10000, 8);
    const premiumAnnual = optionAnnualIncome(25000, 9.5);
    const result = validateInvestmentOptions(
      [
        {
          id: "standard",
          label: "Standard option",
          recommended: true,
          minTicketEur: 10000,
          yieldPct: 8,
          monthlyIncomeEur: optionMonthlyIncome(annual),
          annualIncomeEur: annual,
          commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
        },
        {
          id: "premium",
          label: "Premium option",
          recommended: false,
          minTicketEur: 25000,
          yieldPct: 9.5,
          monthlyIncomeEur: optionMonthlyIncome(premiumAnnual),
          annualIncomeEur: premiumAnnual,
          commercialTermIds: [...DEFAULT_COMMERCIAL_TERM_IDS, "buyback_at_par"]
        }
      ],
      { mix: [{ id: "vehicle_parking", pct: 100 }] }
    );
    expect(result.ok).toBe(false);
  });
});

describe("optionDerivedLabels", () => {
  const standard: InvestmentOption = {
    id: "standard",
    label: "Standard option",
    recommended: true,
    minTicketEur: 10000,
    yieldPct: 8,
    monthlyIncomeEur: 67,
    annualIncomeEur: 800,
    commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
  };
  const premium: InvestmentOption = {
    id: "premium",
    label: "Premium option",
    recommended: false,
    minTicketEur: 25000,
    yieldPct: 9.5,
    monthlyIncomeEur: 198,
    annualIncomeEur: 2375,
    commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
  };

  it("labels the lowest minimum and the highest target", () => {
    const labels = optionDerivedLabels([standard, premium]);
    expect(labels.get("standard")).toEqual(["Lowest minimum"]);
    expect(labels.get("premium")).toEqual(["Highest target"]);
  });

  it("gives a single option both labels", () => {
    const labels = optionDerivedLabels([standard]);
    expect(labels.get("standard")).toEqual(["Lowest minimum", "Highest target"]);
  });

  it("returns an empty map for no options", () => {
    expect(optionDerivedLabels([]).size).toBe(0);
  });
});

describe("illustratorDownsideRows", () => {
  it("halves the target income and floors at zero", () => {
    const rows = illustratorDownsideRows(optionAnnualIncome(10000, 8)); // 800
    expect(rows).toEqual([
      { id: "half_of_target", label: "If income is half of target", monthlyEur: 33 },
      { id: "no_income", label: "If no income is paid", monthlyEur: 0 }
    ]);
  });

  it("rounds via the same monthly helper as the headline figure", () => {
    const rows = illustratorDownsideRows(optionAnnualIncome(11400, 7.8)); // 889
    expect(rows[0]).toEqual({
      id: "half_of_target",
      label: "If income is half of target",
      monthlyEur: 37
    });
  });
});

describe("formatYieldCeiling", () => {
  it("shows up-to band max when options span a band", () => {
    const low = {
      id: "standard" as const,
      label: "Standard",
      recommended: true,
      minTicketEur: 10000,
      yieldPct: 8.2,
      monthlyIncomeEur: 68,
      annualIncomeEur: 820,
      commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
    };
    const high = { ...low, id: "premium" as const, recommended: false, yieldPct: 9.5 };
    expect(formatYieldCeiling([low, high])).toBe("Up to 9.5%");
  });

  it("shows a plain figure when options coincide", () => {
    const only = {
      id: "standard" as const,
      label: "Standard",
      recommended: true,
      minTicketEur: 10000,
      yieldPct: 8.2,
      monthlyIncomeEur: 68,
      annualIncomeEur: 820,
      commercialTermIds: DEFAULT_COMMERCIAL_TERM_IDS
    };
    expect(formatYieldCeiling([only])).toBe("8.2%");
  });
});

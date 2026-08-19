import { describe, expect, it } from "vitest";
import {
  MISSING_PAYMENT_FREQUENCY,
  MISSING_TERM,
  buildOpportunityPresentation,
  cardDetailParity,
  formatPaymentFrequency,
  formatTargetTerm,
  type OpportunityPresentationInput
} from "@/lib/assets/presentation";
import { resolveOpportunityStatus } from "@/lib/assets/opportunity-status";
import type { InvestmentOption } from "@/lib/assets/investment-options";
import type { FundingSnapshot } from "@/lib/assets/funding";

const standardOption: InvestmentOption = {
  id: "standard",
  label: "Standard",
  recommended: true,
  minTicketEur: 10000,
  yieldPct: 8.2,
  monthlyIncomeEur: 68,
  annualIncomeEur: 820,
  commercialTermIds: [
    "triple_net",
    "contractual_monthly_rent",
    "indexation_floor",
    "parkwise_protections",
    "flexible_term"
  ]
};

const openFunding: FundingSnapshot = {
  capacityEur: 1_000_000,
  committedEur: 250_000,
  pct: 25,
  label: "25% funded",
  open: true
};

const fullFunding: FundingSnapshot = {
  capacityEur: 1_000_000,
  committedEur: 1_000_000,
  pct: 100,
  label: "Full",
  open: false
};

function baseInput(
  overrides: Partial<OpportunityPresentationInput> = {}
): OpportunityPresentationInput {
  return {
    name: "Airport Hub A",
    slug: "airport-hub-a",
    city: "Dublin",
    country: "Ireland",
    siteType: "Airport",
    operator: "Ops Co",
    operatorDisplay: null,
    spaces: 420,
    leaseLabel: "7–10 years",
    assetStatus: "published",
    targetYieldPct: 8.2,
    minTicketEur: 10000,
    investmentOptions: [standardOption],
    commercialTermIds: standardOption.commercialTermIds,
    funding: openFunding,
    ...overrides
  };
}

describe("formatTargetTerm", () => {
  it("uses lease label when present", () => {
    expect(formatTargetTerm("7–10 years")).toBe("7–10 years");
  });

  it("falls back when missing", () => {
    expect(formatTargetTerm("")).toBe(MISSING_TERM);
    expect(formatTargetTerm("   ")).toBe(MISSING_TERM);
    expect(formatTargetTerm(null)).toBe(MISSING_TERM);
  });
});

describe("formatPaymentFrequency", () => {
  it("derives Monthly from contractual_monthly_rent", () => {
    expect(formatPaymentFrequency(["contractual_monthly_rent"])).toBe("Monthly");
  });

  it("falls back when term absent", () => {
    expect(formatPaymentFrequency(["triple_net"])).toBe(MISSING_PAYMENT_FREQUENCY);
    expect(formatPaymentFrequency([])).toBe(MISSING_PAYMENT_FREQUENCY);
  });
});

describe("resolveOpportunityStatus", () => {
  it("maps published + open funding to open", () => {
    const s = resolveOpportunityStatus({ assetStatus: "published", funding: openFunding });
    expect(s.id).toBe("open");
    expect(s.label).toBe("Open");
    expect(s.permitsInterest).toBe(true);
    expect(s.showFunding).toBe(true);
  });

  it("maps published + full funding to fully_funded", () => {
    const s = resolveOpportunityStatus({ assetStatus: "published", funding: fullFunding });
    expect(s.id).toBe("fully_funded");
    expect(s.label).toBe("Fully funded");
    expect(s.permitsInterest).toBe(false);
  });

  it("maps closed asset to closed regardless of funding", () => {
    const s = resolveOpportunityStatus({ assetStatus: "closed", funding: openFunding });
    expect(s.id).toBe("closed");
    expect(s.label).toBe("Closed");
    expect(s.permitsInterest).toBe(false);
  });

  it("does not default missing funding to open", () => {
    const s = resolveOpportunityStatus({ assetStatus: "published", funding: null });
    expect(s.id).toBe("unavailable");
    expect(s.permitsInterest).toBe(false);
    expect(s.label).not.toBe("Open");
  });

  it("treats draft and unknown as unavailable", () => {
    expect(resolveOpportunityStatus({ assetStatus: "draft", funding: openFunding }).id).toBe(
      "unavailable"
    );
    expect(
      resolveOpportunityStatus({ assetStatus: "weird" as "published", funding: openFunding }).id
    ).toBe("unavailable");
  });
});

describe("buildOpportunityPresentation", () => {
  it("builds card metrics from canonical fields without hardcoded terms", () => {
    const p = buildOpportunityPresentation(baseInput());
    expect(p.termDisplay).toBe("7–10 years");
    expect(p.paymentFrequencyDisplay).toBe("Monthly");
    expect(p.minTicketDisplay).toBe("€10,000");
    expect(p.yieldDisplay).toBe("8.2%");
    expect(p.status.id).toBe("open");
    expect(p.termDisplay).not.toMatch(/5–10/);
  });

  it("hides return when missing and flags data issue", () => {
    const p = buildOpportunityPresentation(
      baseInput({
        investmentOptions: [],
        targetYieldPct: null
      })
    );
    expect(p.yieldDisplay).toBeNull();
    expect(p.dataIssues).toContain("missing_return");
  });

  it("falls back to asset-level yield and minimum when options are empty", () => {
    // Detail page with a published asset whose investmentOptions is empty:
    // the card shows asset-level figures, so the detail must too (parity).
    const p = buildOpportunityPresentation(baseInput({ investmentOptions: [] }));
    expect(p.yieldDisplay).toBe("8.2%");
    expect(p.minTicketDisplay).toBe("€10,000");
    expect(p.allowsInvestmentCta).toBe(true);
  });

  it("blocks investment CTA when minimum missing", () => {
    const p = buildOpportunityPresentation(
      baseInput({
        investmentOptions: [],
        minTicketEur: null
      })
    );
    expect(p.minTicketDisplay).toBeNull();
    expect(p.allowsInvestmentCta).toBe(false);
  });

  it("blocks investment CTA for fully funded and closed", () => {
    expect(
      buildOpportunityPresentation(baseInput({ funding: fullFunding })).allowsInvestmentCta
    ).toBe(false);
    expect(
      buildOpportunityPresentation(baseInput({ assetStatus: "closed" })).allowsInvestmentCta
    ).toBe(false);
  });

  it("uses neutral operator wording when display missing", () => {
    const p = buildOpportunityPresentation(
      baseInput({ operator: "", operatorDisplay: null })
    );
    expect(p.operatorLabel).toBe("Parking operator");
  });

  it("displays the yield on the band-max basis with an up-to qualifier", () => {
    const premiumOption: InvestmentOption = {
      ...standardOption,
      id: "premium",
      label: "Premium",
      recommended: false,
      minTicketEur: 25000,
      yieldPct: 9.5,
      monthlyIncomeEur: 198,
      annualIncomeEur: 2375
    };
    const p = buildOpportunityPresentation(
      baseInput({ investmentOptions: [standardOption, premiumOption] })
    );
    expect(p.yieldDisplay).toBe("Up to 9.5%");
  });
});

describe("cardDetailParity", () => {
  it("fails when card and detail diverge on term or yield", () => {
    const a = buildOpportunityPresentation(baseInput());
    const b = buildOpportunityPresentation(baseInput({ leaseLabel: "3 years" }));
    expect(cardDetailParity(a, a).ok).toBe(true);
    expect(cardDetailParity(a, b).ok).toBe(false);
    expect(cardDetailParity(a, b).mismatches).toContain("termDisplay");
  });
});

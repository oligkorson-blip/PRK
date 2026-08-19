import { describe, expect, it } from "vitest";
import {
  catalogueMinBasis,
  catalogueYieldBasis,
  countFullyFunded,
  matchesMinBand,
  matchesYieldBand,
  parseCatalogueSort,
  sortCatalogueAssets
} from "@/lib/assets/catalogue-view";
import { DEFAULT_COMMERCIAL_TERM_IDS } from "@/lib/assets/commercial-terms";
import { fundingFromAmounts } from "@/lib/assets/funding";
import type { InvestmentOption } from "@/lib/assets/investment-options";
import type { OpportunityListFields } from "@/lib/assets/list-fields";

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

function asset(
  name: string,
  investmentOptions: InvestmentOption[],
  targetYieldPct: string | number,
  minTicketEur: string | number
) {
  return { name, investmentOptions, targetYieldPct, minTicketEur };
}

describe("catalogueYieldBasis", () => {
  it("uses the band max so display, sort, and filter share one basis", () => {
    expect(catalogueYieldBasis(asset("A", [standard, premium], 8, 10000))).toBe(9.5);
  });

  it("falls back to the asset-level target when there are no options", () => {
    expect(catalogueYieldBasis(asset("A", [], "7.4", 10000))).toBe(7.4);
  });
});

describe("catalogueMinBasis", () => {
  it("uses the recommended option minimum, matching the card display", () => {
    expect(catalogueMinBasis(asset("A", [standard, premium], 8, 10000))).toBe(10000);
  });

  it("falls back to the asset-level minimum when there are no options", () => {
    expect(catalogueMinBasis(asset("A", [], 8, "15000"))).toBe(15000);
  });
});

describe("parseCatalogueSort", () => {
  it("defaults to lowest minimum", () => {
    expect(parseCatalogueSort(null)).toBe("min_asc");
    expect(parseCatalogueSort("bogus")).toBe("min_asc");
  });

  it("accepts the known sort keys", () => {
    expect(parseCatalogueSort("name_asc")).toBe("name_asc");
    expect(parseCatalogueSort("min_asc")).toBe("min_asc");
    expect(parseCatalogueSort("yield_desc")).toBe("yield_desc");
  });
});

describe("sortCatalogueAssets", () => {
  const low = asset("Beta", [standard], 8, 10000);
  const high = asset("Alpha", [standard, premium], 8, 10000);

  it("sorts yield_desc on the band max", () => {
    expect(sortCatalogueAssets([low, high], "yield_desc").map((a) => a.name)).toEqual([
      "Alpha",
      "Beta"
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [low, high];
    sortCatalogueAssets(input, "yield_desc");
    expect(input.map((a) => a.name)).toEqual(["Beta", "Alpha"]);
  });
});

describe("matchesYieldBand", () => {
  it("matches the same basis the card displays", () => {
    expect(matchesYieldBand(9.5, "over9")).toBe(true);
    expect(matchesYieldBand(9.5, "8to9")).toBe(false);
    expect(matchesYieldBand(8.5, "8to9")).toBe(true);
    expect(matchesYieldBand(7.9, "under8")).toBe(true);
    expect(matchesYieldBand(9.5, "all")).toBe(true);
  });
});

describe("matchesMinBand", () => {
  it("keeps the existing band boundaries", () => {
    expect(matchesMinBand(9999, "under10")).toBe(true);
    expect(matchesMinBand(10000, "10to25")).toBe(true);
    expect(matchesMinBand(25000, "10to25")).toBe(true);
    expect(matchesMinBand(25001, "over25")).toBe(true);
    expect(matchesMinBand(10000, "all")).toBe(true);
  });
});

function listAsset(overrides: Partial<OpportunityListFields>): OpportunityListFields {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "hub-a",
    name: "Hub A",
    tier: "standard",
    city: "Dublin",
    country: "Ireland",
    operator: "Ops Co",
    spaces: 100,
    targetYieldPct: 8,
    minTicketEur: 10000,
    incomeMix: [{ id: "vehicle_parking", pct: 100 }],
    investmentOptions: [standard],
    assetStatus: "published",
    ...overrides
  };
}

describe("countFullyFunded", () => {
  it("counts only fully funded published assets", () => {
    const assets = [
      listAsset({ id: "00000000-0000-0000-0000-000000000001", funding: fundingFromAmounts(500000, 1000000) }),
      listAsset({ id: "00000000-0000-0000-0000-000000000002", slug: "hub-b", funding: fundingFromAmounts(1000000, 1000000) }),
      listAsset({ id: "00000000-0000-0000-0000-000000000003", slug: "hub-c", funding: fundingFromAmounts(1000000, 1000000) })
    ];
    expect(countFullyFunded(assets)).toBe(2);
  });

  it("returns zero when nothing is fully funded", () => {
    expect(
      countFullyFunded([
        listAsset({ funding: fundingFromAmounts(0, 1000000) })
      ])
    ).toBe(0);
  });
});

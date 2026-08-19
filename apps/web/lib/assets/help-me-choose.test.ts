import { describe, expect, it } from "vitest";
import { fundingFromAmounts } from "@/lib/assets/funding";
import {
  classifyTermYears,
  matchHelpMeChoose,
  parseLeaseYears,
  type ChooserAnswers
} from "@/lib/assets/help-me-choose";
import type { OpportunityListFields } from "@/lib/assets/list-fields";

function listAsset(overrides: Partial<OpportunityListFields> = {}): OpportunityListFields {
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
    leaseLabel: "12 years",
    assetStatus: "published",
    siteType: "station",
    funding: fundingFromAmounts(100_000, 1_000_000),
    visitorsProvenance: "withheld",
    revenueProvenance: "withheld",
    ...overrides
  };
}

const FORBIDDEN = /suitable|best for you|recommended|safer|lower risk/i;

describe("parseLeaseYears", () => {
  it("parses a single year", () => {
    expect(parseLeaseYears("12 years")).toBe(12);
  });

  it("uses midpoint for ranged labels", () => {
    expect(parseLeaseYears("10–15 years")).toBe(12.5);
    expect(parseLeaseYears("10-15 years")).toBe(12.5);
  });

  it("returns null for unparseable labels", () => {
    expect(parseLeaseYears("weird")).toBeNull();
    expect(parseLeaseYears("")).toBeNull();
  });
});

describe("classifyTermYears", () => {
  it("maps into le11 / eq12 / ge13 bands", () => {
    expect(classifyTermYears(10)).toBe("le11");
    expect(classifyTermYears(11)).toBe("le11");
    expect(classifyTermYears(12)).toBe("eq12");
    expect(classifyTermYears(12.5)).toBe("eq12");
    expect(classifyTermYears(13)).toBe("ge13");
  });
});

describe("matchHelpMeChoose", () => {
  const openLow = listAsset({
    id: "00000000-0000-0000-0000-000000000001",
    slug: "low-station",
    name: "Alpha Station",
    minTicketEur: 9900,
    siteType: "station",
    leaseLabel: "12 years"
  });
  const openAirport = listAsset({
    id: "00000000-0000-0000-0000-000000000002",
    slug: "mid-airport",
    name: "Beta Airport",
    minTicketEur: 15000,
    siteType: "airport",
    leaseLabel: "10 years"
  });
  const openCity = listAsset({
    id: "00000000-0000-0000-0000-000000000003",
    slug: "high-city",
    name: "Gamma City",
    minTicketEur: 30000,
    siteType: "city",
    leaseLabel: "15 years",
    incomeMix: [
      { id: "vehicle_parking", pct: 70 },
      { id: "ev_charging", pct: 30 }
    ],
    visitorsProvenance: "modelled",
    revenueProvenance: "modelled"
  });
  const fullyFunded = listAsset({
    id: "00000000-0000-0000-0000-000000000004",
    slug: "funded",
    name: "Zed Funded",
    minTicketEur: 9900,
    siteType: "station",
    funding: fundingFromAmounts(1_000_000, 1_000_000)
  });

  const pool = [openLow, openAirport, openCity, fullyFunded];

  it("excludes non-open assets from the pool", () => {
    const { results } = matchHelpMeChoose(pool, {
      budget: null,
      place: null,
      term: null,
      figures: null
    });
    expect(results.map((r) => r.asset.slug)).not.toContain("funded");
    expect(results).toHaveLength(3);
  });

  it("hard-filters by budget using matchesMinBand", () => {
    const { results } = matchHelpMeChoose(pool, {
      budget: "under10",
      place: null,
      term: null,
      figures: null
    });
    expect(results.map((r) => r.asset.slug)).toEqual(["low-station"]);
    expect(results[0].reasons.some((r) => r.includes("under €10k"))).toBe(true);
  });

  it("hard-filters by place type", () => {
    const { results, relaxedPlace } = matchHelpMeChoose(pool, {
      budget: null,
      place: "airport",
      term: null,
      figures: null
    });
    expect(relaxedPlace).toBe(false);
    expect(results.map((r) => r.asset.slug)).toEqual(["mid-airport"]);
    expect(results[0].reasons.some((r) => /Airport/i.test(r))).toBe(true);
  });

  it("relaxes place once when hard filters yield nothing", () => {
    const { results, relaxedPlace } = matchHelpMeChoose(pool, {
      budget: "under10",
      place: "retail",
      term: null,
      figures: null
    });
    expect(relaxedPlace).toBe(true);
    expect(results.map((r) => r.asset.slug)).toEqual(["low-station"]);
    expect(results[0].reasons.join(" ")).not.toMatch(/retail/i);
  });

  it("keeps budget matches after place relax when place alone was empty", () => {
    const { results, relaxedPlace } = matchHelpMeChoose(pool, {
      budget: "over25",
      place: "retail",
      term: null,
      figures: null
    });
    expect(relaxedPlace).toBe(true);
    expect(results.map((r) => r.asset.slug)).toEqual(["high-city"]);
  });

  it("returns empty when hard filters still match nothing after place relax", () => {
    const midOnly = [
      listAsset({
        slug: "only-mid",
        name: "Only Mid",
        minTicketEur: 15000,
        siteType: "airport",
        funding: fundingFromAmounts(0, 500_000)
      })
    ];
    const { results, relaxedPlace } = matchHelpMeChoose(midOnly, {
      budget: "under10",
      place: "station",
      term: null,
      figures: null
    });
    expect(relaxedPlace).toBe(true);
    expect(results).toEqual([]);
  });

  it("soft-ranks term without dropping candidates", () => {
    const { results } = matchHelpMeChoose([openLow, openAirport, openCity], {
      budget: null,
      place: null,
      term: "le11",
      figures: null
    });
    expect(results).toHaveLength(3);
    expect(results[0].asset.slug).toBe("mid-airport");
  });

  it("soft-ranks figures comfort without dropping candidates", () => {
    const { results } = matchHelpMeChoose([openLow, openCity], {
      budget: null,
      place: null,
      term: null,
      figures: "mixed"
    });
    expect(results).toHaveLength(2);
    expect(results[0].asset.slug).toBe("high-city");
  });

  it("returns three starters by name when all answers are skipped", () => {
    const { results, relaxedPlace } = matchHelpMeChoose(pool, {
      budget: null,
      place: null,
      term: null,
      figures: null
    });
    expect(relaxedPlace).toBe(false);
    expect(results.map((r) => r.asset.name)).toEqual([
      "Alpha Station",
      "Beta Airport",
      "Gamma City"
    ]);
    expect(results.every((r) => r.reasons[0]?.includes("to start with"))).toBe(true);
  });

  it("omits skipped dimensions from why lines and avoids suitability words", () => {
    const answers: ChooserAnswers = {
      budget: "10to25",
      place: null,
      term: "eq12",
      figures: null
    };
    const { results } = matchHelpMeChoose(pool, answers);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const joined = r.reasons.join(" · ");
      expect(joined).toMatch(/€10–25k|€10-25k/);
      expect(joined.toLowerCase()).not.toMatch(/station|airport|city|retail/);
      expect(joined).not.toMatch(FORBIDDEN);
    }
  });
});

import { describe, expect, it } from "vitest";
import { buildStatTiles } from "@/lib/assets/stat-tiles";

describe("buildStatTiles", () => {
  it("labels visitors and revenue with their provenance hints", () => {
    const tiles = buildStatTiles({
      spaces: 120,
      availableSpaces: 40,
      visitorsPerDay: 1800,
      visitorsProvenance: "modelled",
      annualRevenueEur: 1021440,
      revenueProvenance: "contracted"
    });
    expect(tiles).toEqual([
      { label: "Visitors / day", value: "1,800", hint: "Modelled figure — not audited accounts" },
      { label: "Available spaces", value: "40", hint: null },
      { label: "Annual revenue", value: "€1,021,440", hint: "Contracted figure" }
    ]);
  });

  it("withholds figures whose provenance is withheld", () => {
    const tiles = buildStatTiles({
      spaces: 120,
      visitorsPerDay: 1800,
      visitorsProvenance: "withheld",
      annualRevenueEur: 500000,
      revenueProvenance: "withheld"
    });
    expect(tiles).toEqual([{ label: "Parking spaces", value: "120", hint: null }]);
  });

  it("falls back to total spaces when availableSpaces is null", () => {
    const tiles = buildStatTiles({ spaces: 85, availableSpaces: null });
    expect(tiles[0]).toEqual({ label: "Parking spaces", value: "85", hint: null });
  });

  it("formats occupancy from the numeric string stored on the asset row", () => {
    const tiles = buildStatTiles({ spaces: 10, occupancyPct: "95.50" });
    expect(tiles[1]).toEqual({ label: "Occupancy", value: "95.5%", hint: null });
  });

  it("rejects out-of-range or non-numeric occupancy", () => {
    expect(buildStatTiles({ spaces: 10, occupancyPct: "140" })).toHaveLength(1);
    expect(buildStatTiles({ spaces: 10, occupancyPct: "n/a" })).toHaveLength(1);
  });

  it("adds the target term and honours the tile limit", () => {
    const tiles = buildStatTiles(
      {
        spaces: 120,
        availableSpaces: 40,
        visitorsPerDay: 1800,
        visitorsProvenance: "contracted",
        annualRevenueEur: 900000,
        revenueProvenance: "modelled",
        occupancyPct: "96.00",
        termDisplay: "5 years"
      },
      { includeTerm: true, limit: 3 }
    );
    expect(tiles).toHaveLength(3);
    expect(tiles.map((t) => t.label)).toEqual([
      "Visitors / day",
      "Available spaces",
      "Annual revenue"
    ]);
  });

  it("includes the term tile when there is room", () => {
    const tiles = buildStatTiles(
      { spaces: 30, termDisplay: "6 years" },
      { includeTerm: true, limit: 3 }
    );
    expect(tiles.map((t) => t.label)).toEqual(["Parking spaces", "Target term"]);
  });
});

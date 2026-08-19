import { describe, expect, it } from "vitest";
import {
  assetToFormInput,
  emptyAssetFormInput,
  isSafeHttpUrl,
  slugifyAssetName,
  validateAssetForm,
  type AssetFormInput
} from "@/lib/assets/asset-form";
import type { Asset } from "@/lib/assets";

function validInput(overrides: Partial<AssetFormInput> = {}): AssetFormInput {
  return {
    name: "Lisbon Airport Parking",
    city: "Lisbon",
    country: "Portugal",
    siteType: "airport",
    spaces: "420",
    occupancyPct: "86.5",
    operator: "ParkOperator Lda",
    term: "12 years",
    paymentFrequency: "monthly",
    advisoryCapacityEur: "1500000",
    description: "Busy airport car park next to the terminal.",
    coverImageUrl: "https://images.example.com/lisbon.jpg",
    placeStory: "",
    operatorStory: "",
    demandStory: "",
    numbersNote: "",
    visitorsProvenance: "withheld",
    revenueProvenance: "withheld",
    incomeMix: [
      { id: "vehicle_parking", pct: "80" },
      { id: "ev_charging", pct: "20" }
    ],
    standardMinTicketEur: "9900",
    standardYieldPct: "7.7",
    premiumEnabled: false,
    premiumMinTicketEur: "",
    premiumYieldPct: "",
    greenEnabled: false,
    greenMinTicketEur: "",
    greenYieldPct: "",
    ...overrides
  };
}

describe("slugifyAssetName", () => {
  it("lowercases, strips punctuation and diacritics", () => {
    expect(slugifyAssetName("Lisbon Airport — Parking!")).toBe("lisbon-airport-parking");
    expect(slugifyAssetName("München Süd")).toBe("munchen-sud");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(slugifyAssetName("  —!!!—  ")).toBe("");
  });
});

describe("emptyAssetFormInput", () => {
  it("defaults to a 100% vehicle parking mix and monthly frequency", () => {
    const input = emptyAssetFormInput();
    expect(input.incomeMix).toEqual([{ id: "vehicle_parking", pct: "100" }]);
    expect(input.paymentFrequency).toBe("monthly");
    expect(input.spaces).toBe("");
    expect(input.occupancyPct).toBe("");
    expect(input.premiumEnabled).toBe(false);
    expect(input.greenEnabled).toBe(false);
  });
});

describe("validateAssetForm", () => {
  it("accepts a valid form and derives catalogue-consistent values", () => {
    const result = validateAssetForm(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.slug).toBe("lisbon-airport-parking");
    expect(result.values.targetYieldPct).toBe("7.70");
    expect(result.values.minTicketEur).toBe(9900);
    expect(result.values.spaces).toBe(420);
    expect(result.values.occupancyPct).toBe("86.50");
    expect(result.values.leaseLabel).toBe("12 years");
    expect(result.values.blurb).toContain("airport car park");
    expect(result.values.advisoryCapacityEur).toBe(1500000);
    expect(result.values.coverImageUrl).toBe("https://images.example.com/lisbon.jpg");
    expect(result.values.commercialTermIds).toContain("contractual_monthly_rent");
    expect(result.values.investmentOptions).toHaveLength(1);
    const standard = result.values.investmentOptions[0]!;
    expect(standard.id).toBe("standard");
    expect(standard.annualIncomeEur).toBe(762); // round(9900 × 7.7 / 100)
    expect(standard.monthlyIncomeEur).toBe(64); // round(762 / 12)
    expect(standard.recommended).toBe(true);
  });

  it("persists trimmed story fields and defaults blank stories to null", () => {
    const result = validateAssetForm(
      validInput({
        placeStory: "  Place matters.  ",
        operatorStory: "",
        demandStory: " Demand drivers. ",
        numbersNote: "   "
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.placeStory).toBe("Place matters.");
    expect(result.values.operatorStory).toBeNull();
    expect(result.values.demandStory).toBe("Demand drivers.");
    expect(result.values.numbersNote).toBeNull();
  });

  it("accepts contracted/modelled/withheld provenance", () => {
    const result = validateAssetForm(
      validInput({ visitorsProvenance: "modelled", revenueProvenance: "contracted" })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.visitorsProvenance).toBe("modelled");
    expect(result.values.revenueProvenance).toBe("contracted");
  });

  it("rejects an incomplete operating profile", () => {
    expect(validateAssetForm(validInput({ spaces: "0" }))).toEqual({
      ok: false,
      error: "Parking spaces must be a positive whole number."
    });
    expect(validateAssetForm(validInput({ occupancyPct: "0" }))).toEqual({
      ok: false,
      error: "Occupancy must be a number between 0 and 100."
    });
    expect(validateAssetForm(validInput({ occupancyPct: "101" }))).toEqual({
      ok: false,
      error: "Occupancy must be a number between 0 and 100."
    });
  });

  it("rejects unknown provenance", () => {
    expect(validateAssetForm(validInput({ visitorsProvenance: "audited" }))).toEqual({
      ok: false,
      error: "Unknown visitors provenance."
    });
    expect(validateAssetForm(validInput({ revenueProvenance: "guess" }))).toEqual({
      ok: false,
      error: "Unknown revenue provenance."
    });
  });

  it("drops contractual_monthly_rent when frequency is not monthly", () => {
    const result = validateAssetForm(validInput({ paymentFrequency: "other" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.commercialTermIds).not.toContain("contractual_monthly_rent");
    expect(result.values.commercialTermIds.length).toBeGreaterThan(0);
  });

  it("rejects a premium yield below the standard yield", () => {
    const result = validateAssetForm(
      validInput({
        premiumEnabled: true,
        premiumMinTicketEur: "25000",
        premiumYieldPct: "7.0"
      })
    );
    expect(result).toEqual({ ok: false, error: "premium yield must be ≥ standard" });
  });

  it("accepts an EV (green) option when the mix supports it", () => {
    const result = validateAssetForm(
      validInput({
        greenEnabled: true,
        greenMinTicketEur: "15000",
        greenYieldPct: "8.5"
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.investmentOptions.map((o) => o.id)).toEqual(["standard", "green"]);
    expect(result.values.investmentOptions[1]!.label).toBe("EV option");
  });

  it("rejects a green option without an EV or micromobility story", () => {
    const result = validateAssetForm(
      validInput({
        incomeMix: [{ id: "vehicle_parking", pct: "100" }],
        greenEnabled: true,
        greenMinTicketEur: "15000",
        greenYieldPct: "8.5"
      })
    );
    expect(result).toEqual({
      ok: false,
      error: "green option requires EV or micromobility charging story"
    });
  });

  it("rejects an income mix that does not sum to 100", () => {
    const result = validateAssetForm(
      validInput({
        incomeMix: [
          { id: "vehicle_parking", pct: "60" },
          { id: "ev_charging", pct: "20" }
        ]
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("income mix percentages must sum to 100");
  });

  it("rejects an unsafe cover image URL", () => {
    const result = validateAssetForm(validInput({ coverImageUrl: "javascript:alert(1)" }));
    expect(result).toEqual({
      ok: false,
      error: "Cover image must be an https URL or a site path starting with /."
    });
  });

  it("rejects a plain http cover image URL", () => {
    const result = validateAssetForm(
      validInput({ coverImageUrl: "http://images.example.com/lisbon.jpg" })
    );
    expect(result).toEqual({
      ok: false,
      error: "Cover image must be an https URL or a site path starting with /."
    });
  });

  it("requires a name, term and description", () => {
    expect(validateAssetForm(validInput({ name: " " }))).toEqual({
      ok: false,
      error: "Name is required."
    });
    expect(validateAssetForm(validInput({ term: "" }))).toEqual({
      ok: false,
      error: 'Term is required (e.g. "12 years").'
    });
    expect(validateAssetForm(validInput({ description: "" }))).toEqual({
      ok: false,
      error: "Description is required."
    });
  });

  it("treats a blank advisory capacity as null", () => {
    const result = validateAssetForm(validInput({ advisoryCapacityEur: "" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.advisoryCapacityEur).toBeNull();
  });
});

describe("isSafeHttpUrl", () => {
  it("accepts https URLs and site-relative paths", () => {
    expect(isSafeHttpUrl("https://images.example.com/a.jpg")).toBe(true);
    expect(isSafeHttpUrl("/images/a.jpg")).toBe(true);
  });

  it("rejects plain http, protocol-relative and non-http schemes", () => {
    expect(isSafeHttpUrl("http://images.example.com/a.jpg")).toBe(false);
    expect(isSafeHttpUrl("//evil.example.com/a.jpg")).toBe(false);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("assetToFormInput", () => {
  const asset = {
    id: "asset-1",
    slug: "lisbon-airport-parking",
    name: "Lisbon Airport Parking",
    operator: "ParkOperator Lda",
    city: "Lisbon",
    district: "Lisbon",
    country: "Portugal",
    targetYieldPct: "7.70",
    tier: "Standard",
    minTicketEur: 9900,
    spaces: 420,
    occupancyPct: "86.50",
    leaseLabel: "12 years",
    blurb: "Busy airport car park next to the terminal.",
    placeStory: "Place story",
    operatorStory: null,
    demandStory: "Demand story",
    numbersNote: "Numbers note",
    status: "draft",
    advisoryCapacityEur: 1500000,
    artVariant: 0,
    incomeMix: [
      { id: "vehicle_parking", pct: 80 },
      { id: "ev_charging", pct: 20 }
    ],
    visitorsPerDay: null,
    visitorsProvenance: "withheld",
    availableSpaces: null,
    annualRevenueEur: null,
    revenueProvenance: "withheld",
    commercialTermIds: [
      "triple_net",
      "contractual_monthly_rent",
      "indexation_floor",
      "parkwise_protections",
      "flexible_term"
    ],
    investmentOptions: [
      {
        id: "standard",
        label: "Standard option",
        recommended: true,
        minTicketEur: 9900,
        yieldPct: 7.7,
        monthlyIncomeEur: 64,
        annualIncomeEur: 762,
        commercialTermIds: []
      },
      {
        id: "green",
        label: "EV option",
        recommended: false,
        minTicketEur: 15000,
        yieldPct: 8.5,
        monthlyIncomeEur: 106,
        annualIncomeEur: 1275,
        commercialTermIds: []
      }
    ],
    operatorDisplay: null,
    siteType: "airport",
    coverImageUrl: "https://images.example.com/lisbon.jpg",
    coverImageCaption: null,
    galleryImageUrls: [],
    createdAt: new Date("2026-07-23T00:00:00Z"),
    updatedAt: new Date("2026-07-23T00:00:00Z")
  } as unknown as Asset;

  it("maps a draft asset back to raw form inputs", () => {
    const input = assetToFormInput(asset);
    expect(input.name).toBe("Lisbon Airport Parking");
    expect(input.term).toBe("12 years");
    expect(input.paymentFrequency).toBe("monthly");
    expect(input.spaces).toBe("420");
    expect(input.occupancyPct).toBe("86.5");
    expect(input.advisoryCapacityEur).toBe("1500000");
    expect(input.description).toContain("airport car park");
    expect(input.coverImageUrl).toBe("https://images.example.com/lisbon.jpg");
    expect(input.placeStory).toBe("Place story");
    expect(input.operatorStory).toBe("");
    expect(input.demandStory).toBe("Demand story");
    expect(input.numbersNote).toBe("Numbers note");
    expect(input.visitorsProvenance).toBe("withheld");
    expect(input.revenueProvenance).toBe("withheld");
    expect(input.incomeMix).toEqual([
      { id: "vehicle_parking", pct: "80" },
      { id: "ev_charging", pct: "20" }
    ]);
    expect(input.standardMinTicketEur).toBe("9900");
    expect(input.standardYieldPct).toBe("7.7");
    expect(input.premiumEnabled).toBe(false);
    expect(input.greenEnabled).toBe(true);
    expect(input.greenMinTicketEur).toBe("15000");
    expect(input.greenYieldPct).toBe("8.5");
  });

  it("round-trips through validateAssetForm", () => {
    const result = validateAssetForm(assetToFormInput(asset));
    expect(result.ok).toBe(true);
  });

  it("maps non-monthly assets to the other frequency", () => {
    const other = {
      ...asset,
      commercialTermIds: asset.commercialTermIds.filter(
        (id: string) => id !== "contractual_monthly_rent"
      )
    } as unknown as Asset;
    expect(assetToFormInput(other).paymentFrequency).toBe("other");
  });
});

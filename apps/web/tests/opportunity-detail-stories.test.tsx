import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpportunityDetailLocation } from "@/components/opportunity-detail-location";
import { OpportunityDetailOperator } from "@/components/opportunity-detail-operator";

const baseLoc = {
  city: "Paris",
  country: "France",
  siteType: "Station",
  visitorsPerDay: 100,
  visitorsProvenance: "modelled" as const,
  availableSpaces: 10,
  spaces: 100,
  annualRevenueEur: 1_000_000,
  revenueProvenance: "modelled" as const
};

describe("OpportunityDetailLocation stories", () => {
  it("omits story blocks when null", () => {
    const html = renderToStaticMarkup(createElement(OpportunityDetailLocation, baseLoc));
    expect(html).not.toContain("What drives demand");
    expect(html).toContain("Located in Paris, France");
  });

  it("shows place, demand, and numbers note when provided", () => {
    const html = renderToStaticMarkup(
      createElement(OpportunityDetailLocation, {
        ...baseLoc,
        placeStory: "Place matters because of the rail hub.",
        demandStory: "Commuters and travellers drive weekday demand.",
        numbersNote: "Operating figures are modelled estimates."
      })
    );
    expect(html).toContain("Place matters because of the rail hub.");
    expect(html).toContain("What drives demand");
    expect(html).toContain("Commuters and travellers drive weekday demand.");
    expect(html).toContain("modelled estimates");
    expect(html).not.toContain("Located in Paris, France");
  });
});

describe("OpportunityDetailOperator stories", () => {
  it("uses operator story when provided", () => {
    const html = renderToStaticMarkup(
      createElement(OpportunityDetailOperator, {
        operatorLabel: "National parking operator · France",
        operatorStory:
          "The national parking operator runs a multi-city estate under a lease-style model."
      })
    );
    expect(html).toContain("multi-city estate");
    expect(html).not.toContain("Day-to-day operations sit with");
  });

  it("keeps template fallback when story absent", () => {
    const html = renderToStaticMarkup(
      createElement(OpportunityDetailOperator, {
        operatorLabel: "National parking operator · France"
      })
    );
    expect(html).toContain("Day-to-day operations sit with");
    expect(html).toContain("National parking operator · France");
  });
});

import { describe, expect, it } from "vitest";
import { buildOpportunityStories } from "@/lib/assets/opportunity-stories";

describe("buildOpportunityStories", () => {
  it("builds station stories that mention the place and public operator label", () => {
    const s = buildOpportunityStories({
      name: "INDIGO Gare de Lyon",
      city: "Paris",
      country: "France",
      siteType: "station",
      publicOperatorLabel: "National parking operator · France",
      legalName: "INDIGO"
    });
    expect(s.placeStory).toMatch(/Paris|Gare de Lyon|rail|station/i);
    expect(s.operatorStory).toContain("National parking operator · France");
    expect(s.operatorStory).not.toContain("INDIGO");
    expect(s.demandStory.length).toBeGreaterThan(40);
    expect(s.numbersNote).toMatch(/modelled|estimate|scenario/i);
    expect(s.numbersNote.toLowerCase()).not.toMatch(/academy/);
  });

  it("varies demand language by site type", () => {
    const airport = buildOpportunityStories({
      name: "Airport Hub",
      city: "Dublin",
      country: "Ireland",
      siteType: "airport",
      publicOperatorLabel: "National parking operator · Ireland"
    });
    expect(airport.placeStory + airport.demandStory).toMatch(/airport|flight|passenger/i);

    const city = buildOpportunityStories({
      name: "City Centre Park",
      city: "Berlin",
      country: "Germany",
      siteType: "city",
      publicOperatorLabel: "National parking operator · Germany"
    });
    expect(city.placeStory + city.demandStory).toMatch(/office|retail|city|centre|center/i);

    const retail = buildOpportunityStories({
      name: "Waterfront Retail",
      city: "Hamburg",
      country: "Germany",
      siteType: "retail",
      publicOperatorLabel: "National parking operator · Germany"
    });
    expect(retail.placeStory + retail.demandStory).toMatch(/shop|retail|visitor|weekend/i);
  });
});

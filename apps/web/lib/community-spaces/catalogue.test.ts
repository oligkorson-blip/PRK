import { describe, expect, it } from "vitest";
import {
  communitySpaceCities,
  filterCommunitySpaces,
  normalizeCommunitySpaceCatalogueFilter
} from "@/lib/community-spaces/catalogue";

const spaces = [
  { id: "1", city: "Nicosia", spaceType: "residential" },
  { id: "2", city: "Larnaca", spaceType: "ev_station" },
  { id: "3", city: "Nicosia", spaceType: "garage" }
];

describe("community-space catalogue filters", () => {
  it("normalizes known types and ignores unknown types", () => {
    expect(
      normalizeCommunitySpaceCatalogueFilter({ city: " Nicosia ", type: "garage" })
    ).toEqual({ city: "Nicosia", spaceType: "garage" });
    expect(
      normalizeCommunitySpaceCatalogueFilter({ city: "", type: "unknown" })
    ).toEqual({ city: null, spaceType: null });
  });

  it("filters by city and type without changing the source rows", () => {
    const result = filterCommunitySpaces(
      spaces,
      normalizeCommunitySpaceCatalogueFilter({ city: "Nicosia", type: "garage" })
    );
    expect(result.map((space) => space.id)).toEqual(["3"]);
    expect(spaces).toHaveLength(3);
  });

  it("returns every listing when no filters are active", () => {
    expect(
      filterCommunitySpaces(
        spaces,
        normalizeCommunitySpaceCatalogueFilter({})
      )
    ).toEqual(spaces);
  });

  it("builds sorted unique city options", () => {
    expect(communitySpaceCities(spaces)).toEqual(["Larnaca", "Nicosia"]);
  });
});

import { describe, expect, it } from "vitest";
import { assetLocationLabel } from "@/lib/assets";

describe("assetLocationLabel", () => {
  it("joins city and country with a comma", () => {
    expect(assetLocationLabel({ city: "Paris", country: "France" })).toBe("Paris, France");
  });
});

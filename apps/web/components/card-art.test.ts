import { describe, expect, it } from "vitest";
import { cardArtPaletteIndex } from "@/components/card-art";

describe("cardArtPaletteIndex", () => {
  it("maps variants 0 and 5 into palette range", () => {
    expect(cardArtPaletteIndex(0)).toBe(0);
    expect(cardArtPaletteIndex(5)).toBe(5);
  });

  it("wraps out-of-range and negative variants", () => {
    expect(cardArtPaletteIndex(6)).toBe(0);
    expect(cardArtPaletteIndex(-1)).toBe(5);
  });
});

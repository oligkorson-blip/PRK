import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpportunityGallery } from "@/components/card-art";

describe("OpportunityGallery caption", () => {
  it("renders the asset caption above the static concept hint when set", () => {
    const html = renderToStaticMarkup(
      createElement(OpportunityGallery, {
        name: "Lisbon Airport Parking",
        city: "Lisbon",
        coverImageUrl: "https://images.example.com/lisbon.jpg",
        galleryImageUrls: [],
        siteType: "airport",
        coverImageCaption: "Terminal forecourt, illustrative."
      })
    );
    expect(html).toContain("Terminal forecourt, illustrative.");
    expect(html).toMatch(/Site imagery for orientation|Illustrative photo/i);
  });

  it("keeps only the static hint when caption is empty", () => {
    const html = renderToStaticMarkup(
      createElement(OpportunityGallery, {
        name: "Lisbon Airport Parking",
        city: "Lisbon",
        coverImageUrl: null,
        siteType: "airport",
        coverImageCaption: null
      })
    );
    expect(html).not.toContain("Terminal forecourt");
    expect(html).toMatch(/Illustrative photo of a comparable site/i);
  });
});

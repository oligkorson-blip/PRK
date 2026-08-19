import { describe, expect, it } from "vitest";
import { articleJsonLd } from "@/lib/guides/article-jsonld";
import { getGuide } from "@/lib/guides/catalog";

describe("articleJsonLd", () => {
  it("builds an Article node with headline, dateModified and Organization author", () => {
    const guide = getGuide("can-you-exit-early");
    if (!guide) throw new Error("guide missing");
    const ld = articleJsonLd(guide);
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Article");
    expect(ld.headline).toBe("Can you exit early?");
    expect(ld.description).toBe(guide.dek);
    expect(ld.dateModified).toBe("2026-07-19");
    expect(ld.author).toEqual({ "@type": "Organization", name: "Parkwise" });
  });
});

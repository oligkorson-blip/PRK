import { describe, expect, it } from "vitest";
import { GUIDES, GUIDE_SLUGS, getGuide, getGuideOrNotFound, relatedGuides } from "@/lib/guides/catalog";

describe("guide catalog review dates", () => {
  it("every guide carries an ISO reviewedAt date", () => {
    for (const g of GUIDES) {
      expect(g.reviewedAt, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("getGuide", () => {
  it("finds a guide by slug and returns undefined for unknown slugs", () => {
    expect(getGuide("can-you-exit-early")?.title).toBe("Can you exit early?");
    expect(getGuide("no-such-guide")).toBeUndefined();
  });
});

describe("getGuideOrNotFound", () => {
  it("returns the guide for a known slug", () => {
    expect(getGuideOrNotFound("can-you-exit-early").title).toBe("Can you exit early?");
  });

  it("throws the Next not-found error for an unknown slug (route 404s instead of crashing)", () => {
    expect(() => getGuideOrNotFound("no-such-guide")).toThrowError(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});

describe("relatedGuides", () => {
  it("excludes the guide itself and returns at most 3 entries", () => {
    const related = relatedGuides("parking-investment-risks");
    expect(related.length).toBeGreaterThanOrEqual(2);
    expect(related.length).toBeLessThanOrEqual(3);
    expect(related.map((g) => g.slug)).not.toContain("parking-investment-risks");
  });

  it("prefers guides from the same category", () => {
    const related = relatedGuides("what-monthly-distributions-mean");
    expect(related[0]?.category).toBe("Understanding returns");
    expect(related[0]?.slug).toBe("how-hub-income-is-stacked");
  });

  it("returns an empty list for an unknown slug", () => {
    expect(relatedGuides("no-such-guide")).toEqual([]);
  });

  it("only returns slugs that exist in the catalog", () => {
    for (const slug of GUIDE_SLUGS) {
      for (const g of relatedGuides(slug)) {
        expect(GUIDE_SLUGS).toContain(g.slug);
      }
    }
  });
});

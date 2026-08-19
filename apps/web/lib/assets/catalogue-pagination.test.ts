import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  cataloguePageSlice,
  catalogueTotalPages
} from "@/lib/assets/catalogue-pagination";

describe("catalogue pagination", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("limits first page to PAGE_SIZE (12)", () => {
    expect(PAGE_SIZE).toBe(12);
    expect(cataloguePageSlice(items, 1)).toHaveLength(12);
    expect(cataloguePageSlice(items, 1)[0]).toBe(1);
    expect(cataloguePageSlice(items, 1)[11]).toBe(12);
  });

  it("serves remaining items on last page", () => {
    expect(catalogueTotalPages(25)).toBe(3);
    expect(cataloguePageSlice(items, 3)).toEqual([25]);
  });

  it("clamps out-of-range pages", () => {
    expect(cataloguePageSlice(items, 99)).toEqual([25]);
    expect(cataloguePageSlice(items, 0)).toHaveLength(12);
  });

  it("falls back to page 1 for non-finite pages", () => {
    const firstPage = cataloguePageSlice(items, 1);
    expect(cataloguePageSlice(items, NaN)).toEqual(firstPage);
    expect(cataloguePageSlice(items, Infinity)).toEqual(firstPage);
    expect(cataloguePageSlice(items, -Infinity)).toEqual(firstPage);
  });

  it("never reports zero pages", () => {
    expect(catalogueTotalPages(0)).toBe(1);
    expect(cataloguePageSlice([], 5)).toEqual([]);
  });
});

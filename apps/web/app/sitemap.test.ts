import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("sitemap freshness", () => {
  it("uses catalog review dates instead of stamping guide pages as updated now", () => {
    const src = readFileSync(path.join(root, "app/sitemap.ts"), "utf8");

    expect(src).toContain('import { GUIDES } from "@/lib/guides/catalog";');
    expect(src).toContain("lastModified: guide.reviewedAt");
    expect(src).not.toContain("lastModified: now,\n    changeFrequency");
  });

  it("does not publish private opportunity URLs", () => {
    const src = readFileSync(path.join(root, "app/sitemap.ts"), "utf8");

    expect(src).not.toContain("listPublishedAssets");
    expect(src).not.toContain("/opportunities/");
  });
});

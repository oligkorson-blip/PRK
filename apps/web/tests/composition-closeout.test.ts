import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("composition redesign close-out", () => {
  it("keeps portal active overview risk language", () => {
    const src = read("app/portal/page.tsx");
    expect(src).toContain("RISK_LINE");
    expect(src).toContain("Your progress");
  });

  it("builds apply deep links with asset context", () => {
    const src = read("lib/copy/cta.ts");
    expect(src).toContain("buildApplyHref");
    expect(src).toContain('params.set("asset"');
    expect(src).toContain('params.set("option"');
  });

  it("wires CTA pulse and the scaled photo treatment on the home hero", () => {
    const css = read("app/home.css");
    expect(css).toContain(".home-hero-cta-primary");
    expect(css).toContain("hero-cta-pulse");
    expect(css).toContain(".home-hero-bg");
    expect(css).toContain("transform: scale(1.08);");
  });
});

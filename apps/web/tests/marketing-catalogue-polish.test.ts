import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("marketing / catalogue polish", () => {
  it("uses container-narrow for task/document intros and how-it-works", () => {
    const intro = read("components/page-intro.tsx");
    expect(intro).toContain("container container-narrow");
    expect(intro).not.toMatch(/container narrow(?!-)/);

    const how = read("app/how-it-works/page.tsx");
    expect(how).toContain("container container-narrow");
    expect(how).not.toMatch(/container narrow(?!-)/);
  });

  it("routes functional/editorial heroes through PageIntro", () => {
    for (const file of [
      "app/fees/page.tsx",
      "app/contact/page.tsx",
      "app/documents/page.tsx",
      "app/about/page.tsx",
      "app/why-parking/page.tsx"
    ]) {
      const src = read(file);
      expect(src).toContain('from "@/components/page-intro"');
      expect(src).toContain("<PageIntro");
      expect(src).not.toMatch(/<section className="page-hero">/);
      expect(src).not.toMatch(/page-intro page-intro-editorial page-hero/);
    }
  });

  it("keeps home campaign markup without orphan page-intro-campaign class", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("CAMPAIGN_HEADLINE");
    expect(home).toContain("REQUEST_ACCESS_LABEL");
    expect(home).toContain("HOME_FAQ");
    expect(home).toContain("HOME_TRUST_FACTS");
    expect(home).toContain("HOME_RISK");
    expect(home).toContain("HOME_QUIET");
    expect(home).toContain("Browse opportunities");
    expect(home).not.toContain("page-intro-campaign");
  });

  it("closes the catalogue tier primer by default", () => {
    const src = read("app/opportunities/page.tsx");
    expect(src).toContain('className="sim-assumptions tier-primer"');
    expect(src).not.toMatch(/tier-primer" open/);
  });

  it("trims opportunity detail jump nav without dropping section components", () => {
    const src = read("components/opportunity-detail-client.tsx");
    expect(src).toMatch(/id: "overview"/);
    expect(src).toMatch(/id: "location"/);
    expect(src).toMatch(/id: "returns"/);
    expect(src).toMatch(/id: "terms"/);
    expect(src).toMatch(/id: "risks"/);
    expect(src).toMatch(/id: "documents"/);
    expect(src).not.toMatch(/id: "faq"/);
    expect(src).not.toMatch(/id: "operator"/);
    expect(src).not.toMatch(/id: "fees"/);
    expect(src).toContain("OpportunityDetailLocation");
    expect(src).toContain("OpportunityDetailOperator");
    expect(src).toContain("OpportunityDetailFaq");
    expect(src).toContain("termsSeen");
    expect(read("components/opportunity-detail-location.tsx")).toContain('id="location"');
    expect(read("components/opportunity-detail-operator.tsx")).toContain('id="operator"');
    expect(read("components/opportunity-detail-fees.tsx")).toContain('id="terms"');
  });

  it("ships the home trust strip, original hero image, and campaign headline", () => {
    const home = read("app/page.tsx");
    expect(home).toContain("HOME_TRUST_FACTS");
    expect(home).toContain("STATUS_BAR_HOME");
    expect(home).toContain("CAMPAIGN_HEADLINE");
    expect(home).toContain("home-hero-bg");
    expect(home).toContain("hero-main.jpg");
    expect(home).not.toContain("AssetVisual");
  });
});

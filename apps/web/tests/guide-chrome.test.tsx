import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GuideBreadcrumb, GuideDisclaimer, RelatedGuides } from "@/components/guide-chrome";
import { GUIDE_ILLUSTRATIVE_DISCLAIMER, RISK_LINE } from "@/lib/copy/consumer";
import { GUIDE_SLUGS } from "@/lib/guides/catalog";
import GuidesIndexPage from "@/app/guides/page";
import { metadata as hubIncomeMetadata } from "@/app/guides/how-hub-income-is-stacked/page";

describe("GuideBreadcrumb", () => {
  it("links back to all guides", () => {
    const html = renderToStaticMarkup(createElement(GuideBreadcrumb));
    expect(html).toContain('href="/guides"');
    expect(html).toContain("All guides");
  });

  it("carries the always-visible illustrative disclaimer", () => {
    const html = renderToStaticMarkup(createElement(GuideBreadcrumb));
    expect(html).toContain(GUIDE_ILLUSTRATIVE_DISCLAIMER);
  });
});

describe("GuideDisclaimer", () => {
  it("states the content is illustrative, not a live offering, with capital at risk", () => {
    const html = renderToStaticMarkup(createElement(GuideDisclaimer));
    expect(html).toContain("illustrative");
    expect(html).toContain("not a live investment offering");
    expect(html).toContain("Capital at risk");
    expect(html).not.toContain("&#x27;");
  });
});

describe("guide article pages", () => {
  it("all render the shared GuideBreadcrumb chrome", () => {
    // Each article page mounts <GuideBreadcrumb />, which carries the
    // illustrative disclaimer — verified against the page sources so a new
    // guide cannot ship without the shared chrome.
    for (const slug of GUIDE_SLUGS) {
      const source = readFileSync(
        new URL(`../app/guides/${slug}/page.tsx`, import.meta.url),
        "utf8"
      );
      expect(source).toContain("<GuideBreadcrumb />");
    }
  });

  it("all resolve their slug via getGuideOrNotFound so a catalog edit 404s instead of crashing", () => {
    for (const slug of GUIDE_SLUGS) {
      const source = readFileSync(
        new URL(`../app/guides/${slug}/page.tsx`, import.meta.url),
        "utf8"
      );
      expect(source, slug).toContain(`getGuideOrNotFound("${slug}")`);
      expect(source, slug).not.toContain("getGuide(");
    }
  });
});

describe("RelatedGuides", () => {
  it("renders 2–3 related guide links and excludes the current guide", () => {
    const html = renderToStaticMarkup(
      createElement(RelatedGuides, { slug: "parking-investment-risks" })
    );
    expect(html).toContain("Related guides");
    expect(html).toContain('href="/guides/');
    expect(html).not.toContain('href="/guides/parking-investment-risks"');
  });
});

describe("guides index", () => {
  it("shows the standard risk line with a link to the risk disclosure", () => {
    const html = renderToStaticMarkup(createElement(GuidesIndexPage));
    expect(html).toContain(RISK_LINE);
    expect(html).toContain('href="/legal/risk"');
  });

  it("shows the illustrative / not-a-live-offering disclaimer", () => {
    const html = renderToStaticMarkup(createElement(GuidesIndexPage));
    expect(html).toContain(GUIDE_ILLUSTRATIVE_DISCLAIMER);
  });
});

describe("how-hub-income-is-stacked metadata", () => {
  it("has no stray space before the full stop", () => {
    expect(hubIncomeMetadata?.description).toBe(
      "Parking, EV charging, and other income streams on Parkwise opportunities. Capital at risk."
    );
  });
});

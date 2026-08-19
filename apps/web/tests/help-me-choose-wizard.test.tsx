import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HelpMeChooseResults,
  HelpMeChooseWizard
} from "@/components/help-me-choose-wizard";
import { fundingFromAmounts } from "@/lib/assets/funding";
import type { OpportunityListFields } from "@/lib/assets/list-fields";
import {
  CHOOSER_ILLUSTRATIVE_DISCLAIMER,
  CHOOSER_NON_ADVISORY_LINE
} from "@/lib/copy/consumer";
import { metadata as helpMeChooseMetadata } from "@/app/help-me-choose/page";

function listAsset(overrides: Partial<OpportunityListFields> = {}): OpportunityListFields {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "alpha-station",
    name: "Alpha Station",
    tier: "standard",
    city: "Dublin",
    country: "Ireland",
    operator: "Ops Co",
    spaces: 100,
    targetYieldPct: 8,
    minTicketEur: 9900,
    incomeMix: [{ id: "vehicle_parking", pct: 100 }],
    leaseLabel: "12 years",
    assetStatus: "published",
    siteType: "station",
    funding: fundingFromAmounts(100_000, 1_000_000),
    ...overrides
  };
}

describe("HelpMeChooseWizard", () => {
  it("opens on step 1 of 4 with skip available", () => {
    const html = renderToStaticMarkup(
      createElement(HelpMeChooseWizard, { assets: [listAsset()] })
    );
    expect(html).toContain("Step 1 of 4");
    expect(html).toContain("What size investment are you exploring?");
    expect(html).toContain("Skip");
    expect(html).toContain("Continue");
    expect(html).toContain(CHOOSER_ILLUSTRATIVE_DISCLAIMER);
    expect(html).not.toContain("&#x27;");
  });
});

describe("HelpMeChooseResults", () => {
  it("renders why lines, disclaimers, and try-again", () => {
    const html = renderToStaticMarkup(
      createElement(HelpMeChooseResults, {
        matches: [
          {
            asset: listAsset(),
            reasons: ["From under €10k", "Station"]
          }
        ],
        relaxedPlace: false,
        onChangeAnswers: () => undefined
      })
    );
    expect(html).toContain("Here are a few to look at");
    expect(html).toContain("From under €10k");
    expect(html).toContain("Station");
    expect(html).not.toMatch(/hub/i);
    expect(html).toContain(CHOOSER_ILLUSTRATIVE_DISCLAIMER);
    expect(html).toContain(CHOOSER_NON_ADVISORY_LINE);
    expect(html).toContain("Try again");
    expect(html).toContain('href="/opportunities"');
    expect(html).toContain("See all opportunities");
    expect(html.toLowerCase()).not.toMatch(/suitable|best for you|recommended for you/);
  });

  it("shows the relaxed place banner when requested", () => {
    const html = renderToStaticMarkup(
      createElement(HelpMeChooseResults, {
        matches: [],
        relaxedPlace: true,
        onChangeAnswers: () => undefined
      })
    );
    expect(html).toContain("Nothing in that place type for your budget");
    expect(html).not.toMatch(/hub/i);
    expect(html).toContain("No matches for those choices");
  });
});

describe("help-me-choose page wiring", () => {
  it("exposes non-advisory metadata", () => {
    expect(helpMeChooseMetadata.title).toBe("Help me choose");
    expect(String(helpMeChooseMetadata.description).toLowerCase()).toContain("not personal advice");
  });

  it("stays out of the public sitemap (members-only)", () => {
    const source = readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
    expect(source).not.toContain('"/help-me-choose"');
  });

  it("has homepage and catalogue entry points", () => {
    const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    const catalogue = readFileSync(
      new URL("../app/opportunities/page.tsx", import.meta.url),
      "utf8"
    );
    expect(home).toContain('href="/help-me-choose"');
    expect(home).toContain("Help me choose");
    expect(catalogue).toContain('href="/help-me-choose"');
  });

  it("resets to step 1 when changing answers from results", () => {
    const source = readFileSync(
      new URL("../components/help-me-choose-wizard.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(/onChangeAnswers=\{\(\) => \{[\s\S]*setStepIndex\(0\)/);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssetCard, cardPlaceHook } from "@/components/asset-card";
import { fundingFromAmounts } from "@/lib/assets/funding";
import type { OpportunityListFields } from "@/lib/assets/list-fields";
import { RISK_LINE_SHORT, TARGET_RETURN_EXPLAINER } from "@/lib/copy/consumer";

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
    blurb: "Beside the station entrance with steady weekday demand.",
    funding: fundingFromAmounts(0, 1_000_000),
    ...overrides
  };
}

describe("cardPlaceHook", () => {
  it("returns null for empty blurbs", () => {
    expect(cardPlaceHook(null)).toBeNull();
    expect(cardPlaceHook(undefined)).toBeNull();
    expect(cardPlaceHook("   ")).toBeNull();
  });

  it("returns short blurbs unchanged", () => {
    expect(cardPlaceHook("Beside the station entrance.")).toBe("Beside the station entrance.");
  });

  it("truncates long blurbs on a word boundary", () => {
    const long =
      "A busy multi-storey car park next to the main station concourse with steady weekday demand from commuters and visitors.";
    const hook = cardPlaceHook(long, 60);
    expect(hook).not.toBeNull();
    expect(hook!.endsWith("…")).toBe(true);
    expect(hook!.length).toBeLessThanOrEqual(61);
    expect(hook).not.toMatch(/\s…$/);
  });
});

describe("AssetCard catalogue cleanup", () => {
  it("shows one short risk line, place hook, and simpler labels", () => {
    const html = renderToStaticMarkup(createElement(AssetCard, { asset: listAsset() }));
    expect(html).toContain(RISK_LINE_SHORT);
    expect(html).not.toContain(TARGET_RETURN_EXPLAINER);
    expect(html.match(new RegExp(RISK_LINE_SHORT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(
      1
    );
    expect(html).toContain("Beside the station entrance");
    expect(html).toContain("Target return");
    expect(html).toContain(">From<");
    expect(html).not.toContain("Minimum investment");
    expect(html).not.toContain("Target annual return");
  });

  it("hides empty open funding progress", () => {
    const html = renderToStaticMarkup(createElement(AssetCard, { asset: listAsset() }));
    expect(html).not.toContain("Funding status");
    expect(html).not.toContain("€0");
  });

  it("still shows funding when money is committed", () => {
    const html = renderToStaticMarkup(
      createElement(AssetCard, {
        asset: listAsset({ funding: fundingFromAmounts(250_000, 1_000_000) })
      })
    );
    expect(html).toContain("Funding status");
  });

  it("emphasizes target return as the primary card metric", () => {
    const html = renderToStaticMarkup(createElement(AssetCard, { asset: listAsset() }));
    expect(html).toContain("asset-card-metric-primary");
    expect(html).toContain("Target return");
  });

  it("omits place hook and card risk line on homepage variant", () => {
    const html = renderToStaticMarkup(
      createElement(AssetCard, { asset: listAsset(), variant: "homepage" })
    );
    expect(html).not.toContain("Beside the station entrance");
    expect(html).not.toContain(RISK_LINE_SHORT);
  });

  it("simplifies homepage cards to primary metric, from, and explore", () => {
    const html = renderToStaticMarkup(
      createElement(AssetCard, {
        asset: listAsset({ funding: fundingFromAmounts(250_000, 1_000_000) }),
        variant: "homepage"
      })
    );
    expect(html).toContain("asset-card-metric-primary");
    expect(html).toContain("Target return");
    expect(html).toContain("asset-card-from");
    expect(html).toContain("Explore");
    expect(html).not.toContain("Payments");
    expect(html).not.toContain("Term");
    expect(html).not.toContain("Funding status");
    expect(html).not.toContain("asset-card-tags");
    expect(html).not.toContain("btn-primary");
    expect(html).toContain("asset-card-cta-link");
  });
});

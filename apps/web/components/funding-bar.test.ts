import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FundingBar } from "@/components/funding-bar";
import { fundingFromAmounts } from "@/lib/assets/funding";
import { formatEur } from "@/lib/format";

describe("FundingBar", () => {
  it("renders a soft open track (no meter, no meta) when capacity is unknown", () => {
    const html = renderToStaticMarkup(
      createElement(FundingBar, { funding: fundingFromAmounts(0, null) })
    );
    expect(html).toContain("Funding status");
    expect(html).toContain("Open for investment");
    expect(html).toContain("is-open-soft");
    expect(html).toContain("is-soft");
    // Never render a full-looking bar for soft/open funding.
    expect(html).toContain("width:0%");
    expect(html).not.toContain('role="meter"');
    expect(html).not.toContain("indicative target");
  });

  it("renders an accessible meter and meta line when capacity is known", () => {
    const funding = fundingFromAmounts(250_000, 1_000_000);
    const html = renderToStaticMarkup(createElement(FundingBar, { funding }));
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain("25% funded");
    expect(html).toContain("width:25%");
    expect(html).toContain(
      `${formatEur(funding.committedEur)} of ${formatEur(funding.capacityEur!)} indicative target`
    );
  });

  it("shows Full at 100% when capacity is committed", () => {
    const html = renderToStaticMarkup(
      createElement(FundingBar, { funding: fundingFromAmounts(1_000_000, 1_000_000) })
    );
    expect(html).toContain("Full");
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("width:100%");
  });

  it("caps nearly-committed capacity at 99% while still open", () => {
    const html = renderToStaticMarkup(
      createElement(FundingBar, { funding: fundingFromAmounts(999_999, 1_000_000) })
    );
    expect(html).toContain("99% funded");
    expect(html).not.toContain("100% funded");
  });
});

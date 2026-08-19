import { describe, expect, it, vi } from "vitest";

// Guide pages render the async <JsonLd> server component, which reads the CSP
// nonce from next/headers; mock it so the page can be prerendered in tests.
vi.mock("next/headers", () => ({
  headers: async () => new Map()
}));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { NO_PLATFORM_FEE_LINE } from "@/lib/copy/consumer";
import FeesPage from "@/app/fees/page";
import FeesGuidePage from "@/app/guides/how-fees-affect-returns/page";
import ComplaintsPage from "@/app/legal/complaints/page";
import FaqPage from "@/app/faq/page";
import AboutPage from "@/app/about/page";

describe("no-platform-fee copy", () => {
  it("is qualified (today + opportunity-level costs), matching the Terms wording", () => {
    expect(NO_PLATFORM_FEE_LINE).toContain("does not charge a platform fee today");
    expect(NO_PLATFORM_FEE_LINE).toContain("opportunity documents");
  });

  it("fees page renders the shared qualified line", () => {
    const html = renderToStaticMarkup(createElement(FeesPage));
    expect(html).toContain(NO_PLATFORM_FEE_LINE);
  });

  it("how-fees-affect-returns guide renders the shared qualified line", async () => {
    // The page suspends on the async <JsonLd>, so prerender (which awaits
    // suspense boundaries) instead of synchronous renderToStaticMarkup.
    const { prelude } = await prerender(createElement(FeesGuidePage));
    const chunks: Uint8Array[] = [];
    const reader = prelude.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString("utf8");
    expect(html).toContain(NO_PLATFORM_FEE_LINE);
  });

  it("faq page renders the shared qualified line", async () => {
    // The page suspends on the async <JsonLd>, so prerender (which awaits
    // suspense boundaries) instead of synchronous renderToStaticMarkup.
    const { prelude } = await prerender(createElement(FaqPage));
    const chunks: Uint8Array[] = [];
    const reader = prelude.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString("utf8");
    expect(html).toContain(NO_PLATFORM_FEE_LINE);
  });

  it("about page renders the shared qualified line", () => {
    const html = renderToStaticMarkup(createElement(AboutPage));
    expect(html).toContain(NO_PLATFORM_FEE_LINE);
  });

  it("complaints page qualifies the statutory-escalation scope as a belief, not fact", () => {
    const html = renderToStaticMarkup(createElement(ComplaintsPage));
    expect(html).toContain("we believe statutory financial-services ombudsman routes");
    expect(html).toContain("do not cover complaints about this platform");
    expect(html).toContain("current regulatory perimeter");
  });
});

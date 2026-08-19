import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("opportunity mobile CTA", () => {
  it("lands the post-review action on the visible summary card", () => {
    const client = read("components/opportunity-detail-client.tsx");
    const cta = read("lib/copy/cta.ts");
    const css = read("app/globals.css");

    expect(cta).toContain('{ label: "Express interest", href: "#mobile-interest" }');
    expect(client).toContain(
      '<aside className="detail-side" id="mobile-interest">{summaryPanel}</aside>'
    );
    expect(css).toContain(
      "body:has(.mobile-allocation-bar) .detail-side .detail-side-actions > a.btn"
    );
    expect(css).not.toContain(
      "body:has(.mobile-allocation-bar) .detail-summary-mobile .detail-side-actions > a.btn"
    );
  });
});

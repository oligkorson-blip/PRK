import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("opportunity detail document links", () => {
  it("keeps one clear link per document row", () => {
    const src = readFileSync(
      path.join(root, "components/opportunity-detail-documents.tsx"),
      "utf8"
    );

    expect(src).toContain('<Link href={doc.href} className="doc-row-title">');
    expect(src).not.toContain("doc-row-action");
    expect(src).not.toContain("aria-label=");
  });
});

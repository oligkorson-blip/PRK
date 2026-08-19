import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("opportunity catalogue result navigation", () => {
  it("gives paged results a labelled region for focus recovery", () => {
    const src = read("app/opportunities/opportunities-catalogue.tsx");

    expect(src).toContain('role="region"');
    expect(src).toContain('aria-label="Opportunity results"');
    expect(src).toContain("resultsRef.current?.focus();");
    expect(src).toContain('className="filter-count" aria-live="polite"');
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("opportunity risk language", () => {
  it("keeps the risk section direct and professional", () => {
    const src = read("components/opportunity-detail-risks.tsx");

    expect(src).toContain("Risks to consider");
    expect(src).toContain("Review the full risk disclosure");
    expect(src).not.toContain("What can go wrong");
  });
});

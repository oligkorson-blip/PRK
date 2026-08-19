import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("document library language", () => {
  it("uses plain document language across public and investor views", () => {
    const portal = read("app/portal/documents/page.tsx");
    const publicPage = read("app/documents/page.tsx");

    expect(portal).toContain("Find opportunity documents, terms, and statements");
    expect(portal).toContain("documentPackGuidance");
    expect(portal).toContain("{guidance.title}");
    expect(portal).toContain("Browse public documents");
    expect(publicPage).toContain("Public pages and your document library");
    expect(publicPage).toContain("Your account documents appear once you're approved and signed in.");
    expect(portal).not.toMatch(/private packs?/i);
    expect(publicPage).not.toMatch(/private packs?/i);
    expect(portal).not.toContain("opportunity packs");
    expect(publicPage).not.toContain("opportunity packs");
  });
});

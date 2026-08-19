import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("admin agreement queue", () => {
  it("does not link retracted signed copies", () => {
    const src = readFileSync(path.join(root, "app/admin/contracts/page.tsx"), "utf8");

    expect(src).toContain("contract.signedDocumentId && contract.signedDocumentTitle");
    expect(src).toContain('"Retracted"');
  });
});

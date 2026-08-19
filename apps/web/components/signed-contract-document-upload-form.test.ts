import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("signed contract document upload form", () => {
  it("posts the chosen agreement version to the super-admin action", () => {
    const src = readFileSync(
      path.join(root, "components/signed-contract-document-upload-form.tsx"),
      "utf8"
    );

    expect(src).toContain("uploadSignedContractDocument");
    expect(src).toContain('name="contractId"');
    expect(src).toContain('name="contractVersion"');
    expect(src).toContain('accept="application/pdf"');
  });
});

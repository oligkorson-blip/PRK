import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("investor agreement detail", () => {
  it("keeps an active signed copy visible after the agreement is superseded", () => {
    const src = readFileSync(path.join(root, "app/portal/contracts/[id]/page.tsx"), "utf8");

    expect(src).toContain("{contract.signedDocument ? (");
    expect(src).not.toContain('contract.state === "signed_documents_available"');
  });

  it("renders protected review documents and investor review controls", () => {
    const src = readFileSync(path.join(root, "app/portal/contracts/[id]/page.tsx"), "utf8");

    expect(src).toContain("reviewDocuments.summary");
    expect(src).toContain("reviewDocuments.agreement");
    expect(src).toContain("ContractReviewActions");
    expect(src).toContain("/api/documents/");
  });
});

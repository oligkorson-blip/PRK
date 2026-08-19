import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("admin contract queries", () => {
  it("joins investors and hides retracted signed-document metadata in the queue", () => {
    const src = readFileSync(path.join(root, "lib/contracts/admin-queries.ts"), "utf8");

    expect(src).toContain("innerJoin(investors");
    expect(src).toContain("leftJoin(");
    expect(src).toContain('eq(documents.ownerType, "investor")');
    expect(src).toContain("eq(documents.ownerId, contracts.investorId)");
    expect(src).toContain('eq(documents.category, "contract_signed_agreement")');
    expect(src).toContain('eq(documents.contentType, "application/pdf")');
    expect(src).toContain("isNull(documents.retractedAt)");
    expect(src).toContain("signedDocumentId: contracts.signedDocumentId");
  });

  it("loads signer state, transitions, and verified events for a valid staff record", () => {
    const src = readFileSync(path.join(root, "lib/contracts/admin-queries.ts"), "utf8");

    expect(src).toContain("if (!isUuid(contractId)) return null");
    expect(src).toContain("contractSigners");
    expect(src).toContain("contractTransitions");
    expect(src).toContain("contractSignatureEvents");
    expect(src).toContain("signatureEvents");
  });
});

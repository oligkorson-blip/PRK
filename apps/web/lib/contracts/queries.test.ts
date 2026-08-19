import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("investor contract read boundary", () => {
  it("scopes contract reads to the authenticated investor", () => {
    const src = readFileSync(path.join(root, "lib/contracts/queries.ts"), "utf8");

    expect(src).toContain("ensureInvestor");
    expect(src).toContain("eq(contracts.investorId, investor.id)");
    expect(src).toContain("eq(contracts.id, contractId)");
    expect(src).toContain('eq(documents.ownerType, "investor")');
    expect(src).toContain("eq(documents.ownerId, investor.id)");
    expect(src).toContain('eq(documents.category, "contract_signed_agreement")');
    expect(src).toContain('eq(documents.contentType, "application/pdf")');
    expect(src).toContain("isNull(documents.retractedAt)");
  });

  it("keeps malformed or unknown contract ids on the not-found path", () => {
    const src = readFileSync(path.join(root, "lib/contracts/queries.ts"), "utf8");

    expect(src).toContain("if (!isUuid(contractId)) return null");
    expect(src).toContain("if (!row) return null");
  });
});

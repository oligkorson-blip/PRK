import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("provider webhook ingestion boundary", () => {
  it("normalizes verified adapter output before persistence", () => {
    const src = readFileSync(path.join(root, "lib/contracts/provider.ts"), "utf8");

    expect(src).toContain("normalizeProviderWebhook");
    expect(src).toContain("recordVerifiedSignatureEvent");
    expect(src).toContain("verified: true");
  });

  it("keeps raw signature verification in provider-specific adapters", () => {
    const src = readFileSync(path.join(root, "lib/contracts/provider.ts"), "utf8");

    expect(src).toContain("provider-specific verification belongs in the adapter");
    expect(src).not.toContain("verifyHmacWebhook");
  });
});

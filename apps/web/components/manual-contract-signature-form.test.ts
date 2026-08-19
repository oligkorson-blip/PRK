import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("manual contract signature form", () => {
  it("posts the contract version and signer role to the staff action", () => {
    const src = readFileSync(
      path.join(root, "components/manual-contract-signature-form.tsx"),
      "utf8"
    );

    expect(src).toContain("recordManualContractSignature");
    expect(src).toContain('name="contractId"');
    expect(src).toContain('name="contractVersion"');
    expect(src).toContain('name="signerRole"');
    expect(src).toContain('name="signedAt"');
  });

  it("does not offer signing after the lifecycle is closed", () => {
    const src = readFileSync(
      path.join(root, "components/manual-contract-signature-form.tsx"),
      "utf8"
    );

    expect(src).toContain("signingClosed");
    expect(src).toContain("Manual signatures are closed");
  });
});

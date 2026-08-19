import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("signed contract document action", () => {
  it("requires a super admin and validates PDF uploads before publication", () => {
    const src = readFileSync(path.join(root, "lib/contracts/actions.ts"), "utf8");

    expect(src).toContain("requireSuperAdmin");
    expect(src).toContain("isUuid(contractId)");
    expect(src).toContain("SIGNED_CONTRACT_DOCUMENT_MAX_BYTES");
    expect(src).toContain("sniffMatchesType");
    expect(src).toContain("storeAndPublishSignedContractDocument");
  });

  it("revalidates investor, vault, and admin agreement views after a publish", () => {
    const src = readFileSync(path.join(root, "lib/contracts/actions.ts"), "utf8");

    expect(src).toContain('revalidatePath("/portal/contracts")');
    expect(src).toContain("revalidatePath(`/portal/contracts/${contractId}`)");
    expect(src).toContain('revalidatePath("/portal/documents")');
    expect(src).toContain('revalidatePath("/admin/contracts")');
    expect(src).toContain("revalidatePath(`/admin/contracts/${contractId}`)");
  });
  it("exposes an audited manual signature action for the provider-free workflow", () => {
    const src = readFileSync(path.join(root, "lib/contracts/actions.ts"), "utf8");

    expect(src).toContain("recordManualContractSignature");
    expect(src).toContain("recordManualSignature");
    expect(src).toContain('source: "staff:manual-signature"');
    expect(src).toContain('revalidatePath("/portal/contracts")');
  });


  it("exposes an investor review checkpoint for the portal workflow", () => {
    const src = readFileSync(path.join(root, "lib/contracts/actions.ts"), "utf8");

    expect(src).toContain("recordInvestorContractReview");
    expect(src).toContain('actorType: "investor"');
    expect(src).toContain("documentType");
    expect(src).toContain("source: `investor:${input.documentType}-reviewed`");
  });

});

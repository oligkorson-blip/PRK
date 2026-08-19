import { describe, expect, it } from "vitest";
import { canMarkEffective, requiredSignersComplete, signatureEventKey, type ContractSigner } from "./signing";

const signer = (role: ContractSigner["role"], status: ContractSigner["status"]): ContractSigner => ({
  role,
  displayName: role === "investor" ? "Investor" : "Legal signer",
  email: role === "investor" ? "investor@example.com" : "legal@example.com",
  status,
  signedAt: status === "signed" ? "2026-08-01T10:00:00.000Z" : null
});

describe("contract signing boundary", () => {
  it("requires both investor and legal signer signatures", () => {
    expect(requiredSignersComplete([signer("investor", "signed"), signer("legal_signer", "pending")])).toBe(false);
    expect(requiredSignersComplete([signer("investor", "signed"), signer("legal_signer", "signed")])).toBe(true);
  });

  it("only allows effective after both signatures and from the pending state", () => {
    const signers = [signer("investor", "signed"), signer("legal_signer", "signed")];
    expect(canMarkEffective({ contractId: "c-1", contractVersion: "v1", state: "counter_signature_pending", signers })).toBe(true);
    expect(canMarkEffective({ contractId: "c-1", contractVersion: "v1", state: "investor_signed", signers })).toBe(false);
  });

  it("creates a stable idempotency key for provider events", () => {
    expect(signatureEventKey({
      provider: "example",
      providerEventId: "evt-1",
      providerSignerId: "signer-1",
      contractId: "c-1",
      contractVersion: "v1",
      signerRole: "investor",
      status: "signed",
      occurredAt: "2026-08-01T10:00:00.000Z"
    })).toBe("example:evt-1:c-1:v1");
  });
});

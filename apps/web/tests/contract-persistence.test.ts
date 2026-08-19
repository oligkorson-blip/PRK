import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("contract persistence boundary", () => {
  it("defines the persisted contract, signer, event, and transition tables", () => {
    const src = readFileSync(path.join(root, "lib/contracts/persistence.ts"), "utf8");

    expect(src).toContain('"contracts"');
    expect(src).toContain('"contract_signers"');
    expect(src).toContain('"contract_signature_events"');
    expect(src).toContain('"contract_transitions"');
    expect(src).toContain("contract_signers_contract_role_uidx");
    expect(src).toContain("contract_signature_events_provider_key_uidx");
  });

  it("requires verified, idempotent provider events and blocks incomplete effectiveness", () => {
    const src = readFileSync(path.join(root, "lib/contracts/service.ts"), "utf8");

    expect(src).toContain('if (input.verified !== true) throw new Error("UNVERIFIED_SIGNATURE_EVENT")');
    expect(src).toContain("onConflictDoNothing");
    expect(src).toContain("orderBy(");
    expect(src).toContain("desc(contractSignatureEvents.occurredAt)");
    expect(src).toContain("SIGNING_CLOSED_STATES");
    expect(src).toContain("appliedToSigner: applyToSigner");
    expect(src).toContain("providerSignerId: input.providerSignerId ?? null");
    expect(src).toContain("if (!applyToSigner)");
    expect(src).toContain("canMarkEffective");
    expect(src).toContain("CONTRACT_SIGNATURES_INCOMPLETE");
    expect(src).toContain('eq(contractSigners.role, "investor")');
    expect(src).toContain("CONTRACT_INVESTOR_SIGNATURE_INCOMPLETE");
    expect(src).toContain("markSignedDocumentsAvailable");
    expect(src).toContain("storeAndPublishSignedContractDocument");
    expect(src).toContain("SIGNED_CONTRACT_DOCUMENT_CONTENT_TYPE");
    expect(src).toContain("SIGNED_CONTRACT_DOCUMENT_MAX_BYTES");
    expect(src).toContain("SIGNED_DOCUMENT_NOT_FOUND");
    expect(src).toContain("SIGNED_DOCUMENT_INVALID_CONTENT");
    expect(src).toContain("DOCUMENT_STORAGE_NOT_CONFIGURED");
    expect(src).toContain("contract.signed_document_stored");
    expect(src).toContain("deleteObject(storageKey)");
    expect(src).toContain('eq(documents.ownerType, "investor")');
    expect(src).toContain("eq(documents.ownerId, current.investorId)");
    expect(src).toContain('eq(documents.category, "contract_signed_agreement")');
    expect(src).toContain("eq(documents.contentType, SIGNED_CONTRACT_DOCUMENT_CONTENT_TYPE)");
    expect(src).toContain('action: "contract.signature_event_received"');
    expect(src).toContain('action: "contract.transitioned"');
  });

  it("persists provider signer identity on signature receipts", () => {
    const persistenceSrc = readFileSync(path.join(root, "lib/contracts/persistence.ts"), "utf8");
    const migration = readFileSync(path.join(root, "drizzle/0030_contract_signature_identity.sql"), "utf8");

    expect(persistenceSrc).toContain('providerSignerId: text("provider_signer_id")');
    expect(migration).toContain(
      'ALTER TABLE "contract_signature_events" ADD COLUMN "provider_signer_id" text;'
    );
  });
});

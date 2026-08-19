import type { ContractState } from "./lifecycle";

/** `park` remains accepted for compatibility with the original provider-neutral boundary. */
export type ContractSignerRole = "investor" | "legal_signer" | "park";
export type SignatureStatus = "pending" | "signed" | "declined" | "expired";

export interface ContractSigner {
  role: ContractSignerRole;
  displayName: string;
  email: string;
  status: SignatureStatus;
  signedAt: string | null;
}

/** Normalized provider event. Store provider identity and event id for audit/idempotency. */
export interface ContractSignatureEvent {
  provider: string;
  providerEventId: string;
  providerSignerId?: string | null;
  contractId: string;
  contractVersion: string;
  signerRole: ContractSignerRole;
  status: SignatureStatus;
  occurredAt: string;
}

export interface ContractSigningSnapshot {
  contractId: string;
  contractVersion: string;
  state: ContractState;
  signers: readonly ContractSigner[];
}

export function requiredSignersComplete(signers: readonly ContractSigner[]): boolean {
  const signedRoles = new Set(
    signers.filter((signer) => signer.status === "signed").map((signer) => signer.role)
  );
  return (
    signedRoles.has("investor") &&
    (signedRoles.has("legal_signer") || signedRoles.has("park"))
  );
}

export function signatureEventKey(event: ContractSignatureEvent): string {
  return [event.provider, event.providerEventId, event.contractId, event.contractVersion].join(":");
}

export function canMarkEffective(snapshot: ContractSigningSnapshot): boolean {
  return requiredSignersComplete(snapshot.signers) && snapshot.state === "counter_signature_pending";
}

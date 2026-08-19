import { createHmac, timingSafeEqual } from "node:crypto";
import { isUuid } from "@/lib/format";
import type { VerifiedSignatureEventInput } from "./service";
import type { ContractSignerRole, SignatureStatus } from "./signing";

type PersistedSignerRole = Exclude<ContractSignerRole, "park">;

const PERSISTED_SIGNER_ROLES = new Set<PersistedSignerRole>([
  "investor",
  "legal_signer"
]);
const SIGNATURE_STATUSES = new Set<SignatureStatus>([
  "pending",
  "signed",
  "declined",
  "expired"
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Generic HMAC-SHA256 verification primitive for provider adapters that use
 * the conventional `sha256=<hex digest>` header format. Providers with a
 * different signing scheme should implement their own verifier and still
 * call normalizeProviderWebhook only after verification succeeds.
 */
export function verifyHmacWebhook(input: {
  rawBody: string | Buffer;
  signature: string;
  secret: string;
}): boolean {
  if (
    typeof input.secret !== "string" ||
    typeof input.signature !== "string" ||
    (!Buffer.isBuffer(input.rawBody) && typeof input.rawBody !== "string") ||
    input.secret.length === 0 ||
    input.signature.length === 0
  ) {
    return false;
  }

  const parts = input.signature.trim().split("=");
  if (parts.length !== 2) return false;
  const [scheme, digest] = parts;
  if (scheme !== "sha256" || !digest || !/^[a-f0-9]{64}$/i.test(digest)) {
    return false;
  }

  const expected = createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const actualBytes = Buffer.from(digest, "hex");
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

export function normalizeProviderWebhook(input: {
  provider: string;
  eventId: string;
  contractId: string;
  contractVersion: string;
  signerRole: PersistedSignerRole;
  status: SignatureStatus;
  occurredAt: string;
  providerSignerId?: string | null;
  payload?: Record<string, unknown>;
  verified: boolean;
}): VerifiedSignatureEventInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("INVALID_PROVIDER_EVENT");
  }
  if (input.verified !== true) throw new Error("UNVERIFIED_SIGNATURE_EVENT");
  if (
    !isNonEmptyString(input.provider) ||
    !isNonEmptyString(input.eventId) ||
    !isNonEmptyString(input.contractId) ||
    !isNonEmptyString(input.contractVersion) ||
    !isNonEmptyString(input.occurredAt) ||
    !PERSISTED_SIGNER_ROLES.has(input.signerRole) ||
    !SIGNATURE_STATUSES.has(input.status)
  ) {
    throw new Error("INVALID_PROVIDER_EVENT");
  }

  const provider = input.provider.trim();
  const providerEventId = input.eventId.trim();
  const contractId = input.contractId.trim();
  const contractVersion = input.contractVersion.trim();
  const occurredAt = new Date(input.occurredAt);
  let providerSignerId: string | null = null;
  if (input.providerSignerId !== undefined && input.providerSignerId !== null) {
    if (!isNonEmptyString(input.providerSignerId)) {
      throw new Error("INVALID_PROVIDER_EVENT");
    }
    providerSignerId = input.providerSignerId.trim();
  }
  if (!isUuid(contractId) || Number.isNaN(occurredAt.getTime())) {
    throw new Error("INVALID_PROVIDER_EVENT");
  }
  if (input.payload !== undefined && !isRecord(input.payload)) {
    throw new Error("INVALID_PROVIDER_EVENT");
  }

  return {
    provider,
    providerEventId,
    contractId,
    contractVersion,
    signerRole: input.signerRole,
    status: input.status,
    occurredAt,
    providerSignerId,
    payload: input.payload ?? {},
    verified: true
  };
}

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeProviderWebhook, verifyHmacWebhook } from "./webhooks";

const VALID_EVENT = {
  provider: "example",
  eventId: " evt-1 ",
  contractId: "00000000-0000-4000-8000-000000000001",
  contractVersion: "v1",
  signerRole: "legal_signer" as const,
  status: "signed" as const,
  occurredAt: "2026-08-01T10:00:00.000Z",
  providerSignerId: " signer-1 ",
  verified: true
};

describe("contract provider webhook boundary", () => {
  it("verifies the conventional HMAC-SHA256 signature in constant time", () => {
    const rawBody = JSON.stringify({ event: "signature.completed" });
    const secret = "test-secret";
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex");

    expect(
      verifyHmacWebhook({
        rawBody,
        secret,
        signature: `sha256=${digest}`
      })
    ).toBe(true);
    expect(
      verifyHmacWebhook({
        rawBody: `${rawBody} `,
        secret,
        signature: `sha256=${digest}`
      })
    ).toBe(false);
    expect(
      verifyHmacWebhook({
        rawBody,
        secret,
        signature: `sha256=${digest}=extra`
      })
    ).toBe(false);
    expect(
      verifyHmacWebhook({
        rawBody,
        secret: 42 as never,
        signature: `sha256=${digest}`
      })
    ).toBe(false);
    expect(
      verifyHmacWebhook({
        rawBody: 42 as never,
        secret,
        signature: `sha256=${digest}`
      })
    ).toBe(false);
  });

  it("normalizes a verified provider event for the persistence service", () => {
    const event = normalizeProviderWebhook(VALID_EVENT);

    expect(event.providerEventId).toBe("evt-1");
    expect(event.providerSignerId).toBe("signer-1");
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.verified).toBe(true);
  });

  it("rejects malformed ids and unsupported signer or status values", () => {
    expect(() => normalizeProviderWebhook({ ...VALID_EVENT, contractId: "c-1" })).toThrow(
      "INVALID_PROVIDER_EVENT"
    );
    expect(() =>
      normalizeProviderWebhook({ ...VALID_EVENT, verified: 1 as never })
    ).toThrow("UNVERIFIED_SIGNATURE_EVENT");
    expect(() => normalizeProviderWebhook(null as never)).toThrow("INVALID_PROVIDER_EVENT");
    expect(() => normalizeProviderWebhook([] as never)).toThrow("INVALID_PROVIDER_EVENT");
    expect(() =>
      normalizeProviderWebhook({ ...VALID_EVENT, signerRole: "park" as never })
    ).toThrow("INVALID_PROVIDER_EVENT");
    expect(() =>
      normalizeProviderWebhook({ ...VALID_EVENT, status: "unknown" as never })
    ).toThrow("INVALID_PROVIDER_EVENT");
    expect(() =>
      normalizeProviderWebhook({ ...VALID_EVENT, providerSignerId: "   " })
    ).toThrow("INVALID_PROVIDER_EVENT");
    expect(() =>
      normalizeProviderWebhook({ ...VALID_EVENT, payload: [] as never })
    ).toThrow("INVALID_PROVIDER_EVENT");
  });
});

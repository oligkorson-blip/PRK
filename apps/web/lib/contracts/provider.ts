import { recordVerifiedSignatureEvent } from "./service";
import { normalizeProviderWebhook } from "./webhooks";

export type VerifiedProviderWebhookInput = Omit<
  Parameters<typeof normalizeProviderWebhook>[0],
  "verified"
>;

/**
 * Canonical handoff for a provider adapter after it has verified the raw
 * request signature. This function deliberately does not inspect raw headers;
 * provider-specific verification belongs in the adapter.
 */
export async function ingestVerifiedProviderWebhook(
  input: VerifiedProviderWebhookInput
): ReturnType<typeof recordVerifiedSignatureEvent> {
  const normalized = normalizeProviderWebhook({ ...input, verified: true });
  return recordVerifiedSignatureEvent(normalized);
}

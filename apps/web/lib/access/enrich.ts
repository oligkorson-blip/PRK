import { isPrivateIp } from "@/lib/access/ip";
import { enrichFromApi, mapApiPayload } from "./enrich-api";
import { enrichFromLocal } from "./enrich-local";
import type { EnrichmentFields, EnrichmentResult } from "./enrich-types";

export { mapApiPayload };
export type { EnrichmentFields, EnrichmentResult } from "./enrich-types";

function hasEnrichmentSignal(fields: EnrichmentFields): boolean {
  return Boolean(
    fields.countryCode ||
      fields.city ||
      fields.region ||
      fields.timezone ||
      fields.isp ||
      fields.org ||
      fields.isVpn ||
      fields.isProxy ||
      fields.isDatacenter
  );
}

export async function enrichIp(
  ip: string | null,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<EnrichmentResult> {
  if (!ip || isPrivateIp(ip)) {
    return { status: "partial", source: "none" };
  }

  const api = await enrichFromApi(ip, opts);
  if (api && hasEnrichmentSignal(api)) return api;

  const local = await enrichFromLocal(ip);
  if (local && hasEnrichmentSignal(local)) return local;

  return { status: "failed", source: "none", raw: api?.raw ?? local?.raw };
}

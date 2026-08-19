import type { EnrichmentFields, EnrichmentResult } from "./enrich-types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function resolveStatus(fields: EnrichmentFields): EnrichmentResult["status"] {
  if (fields.countryCode || fields.city) return "ok";
  if (fields.isVpn || fields.isProxy || fields.isDatacenter) return "partial";
  return "failed";
}

export function mapApiPayload(body: unknown): EnrichmentFields {
  const data = asRecord(body);
  if (!data) return {};

  const privacy = asRecord(data.privacy);
  const org = asString(data.org);
  const isp = asString(data.isp) ?? org;

  return {
    countryCode:
      asString(data.country_code) ??
      asString(data.countryCode) ??
      asString(data.country),
    countryName: asString(data.country_name) ?? asString(data.countryName),
    region: asString(data.region),
    city: asString(data.city),
    timezone: asString(data.timezone),
    isp,
    org,
    isProxy: asBoolean(privacy?.proxy) ?? asBoolean(data.proxy),
    isVpn: asBoolean(privacy?.vpn) ?? asBoolean(data.vpn),
    isDatacenter: asBoolean(privacy?.hosting) ?? asBoolean(data.hosting),
  };
}

export async function enrichFromApi(
  ip: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<EnrichmentResult | null> {
  const urlTemplate = process.env.IP_ENRICHMENT_API_URL;
  if (!urlTemplate) return null;

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 2000;
  const url = urlTemplate.replace("{ip}", encodeURIComponent(ip));

  const headers: Record<string, string> = {};
  const apiKey = process.env.IP_ENRICHMENT_API_KEY;
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return null;

    const body: unknown = await response.json();
    const fields = mapApiPayload(body);
    const raw = asRecord(body) ?? undefined;

    return {
      ...fields,
      status: resolveStatus(fields),
      source: "api",
      raw,
    };
  } catch {
    return null;
  }
}

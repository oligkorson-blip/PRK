export type EnrichmentFields = {
  countryCode?: string | null;
  countryName?: string | null;
  region?: string | null;
  city?: string | null;
  timezone?: string | null;
  isp?: string | null;
  org?: string | null;
  isProxy?: boolean | null;
  isVpn?: boolean | null;
  isDatacenter?: boolean | null;
};

export type EnrichmentResult = EnrichmentFields & {
  status: "ok" | "partial" | "failed";
  source: "api" | "local" | "none";
  raw?: Record<string, unknown>;
};

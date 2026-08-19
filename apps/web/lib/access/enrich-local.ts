import { existsSync } from "node:fs";
import type { EnrichmentResult } from "./enrich-types";

/**
 * v1 stub: reads IP_ENRICHMENT_MMDB_PATH but does not open MaxMind yet.
 * Returns null when unset, missing, or when MMDB lookup is not wired.
 */
export async function enrichFromLocal(
  _ip: string
): Promise<EnrichmentResult | null> {
  const mmdbPath = process.env.IP_ENRICHMENT_MMDB_PATH;
  if (!mmdbPath || !existsSync(mmdbPath)) {
    return null;
  }

  return null;
}

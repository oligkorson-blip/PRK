export const METRIC_PROVENANCE = ["contracted", "modelled", "withheld"] as const;
export type MetricProvenance = (typeof METRIC_PROVENANCE)[number];

export function isMetricProvenance(value: unknown): value is MetricProvenance {
  return typeof value === "string" && (METRIC_PROVENANCE as readonly string[]).includes(value);
}

export function provenanceHint(provenance: MetricProvenance): string | null {
  if (provenance === "contracted") return "Contracted figure";
  if (provenance === "modelled") return "Modelled figure — not audited accounts";
  return null;
}

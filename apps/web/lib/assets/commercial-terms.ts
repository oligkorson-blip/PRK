/** Hybrid C commercial term catalogue — UI labels + Risk schedule ids. */

export const COMMERCIAL_TERM_IDS = [
  "triple_net",
  "contractual_monthly_rent",
  "buyback_at_par",
  "indexation_floor",
  "parkwise_protections",
  "flexible_term"
] as const;

export type CommercialTermId = (typeof COMMERCIAL_TERM_IDS)[number];

export const COMMERCIAL_TERM_LABELS: Record<CommercialTermId, string> = {
  triple_net: "Operator lease structure",
  contractual_monthly_rent: "Target income from operator rent",
  buyback_at_par: "Buyback terms (where a funded buyback is disclosed)",
  indexation_floor: "Indexation where stated in the lease",
  parkwise_protections: "Investor protections in the deal terms",
  flexible_term: "Flexible terms where offered"
};

/** One-line “not meaning” for on-page Hybrid C hygiene (CRO). */
export const COMMERCIAL_TERM_NOT_MEANING: Record<CommercialTermId, string> = {
  triple_net:
    "Does not mean you are the landlord or collect operator rent directly.",
  contractual_monthly_rent:
    "Does not mean a guaranteed payment to you.",
  buyback_at_par:
    "Does not mean an unconditional cash exit. Only applies where the option includes it and Terms allow.",
  indexation_floor: "Does not mean inflation protection in every scenario.",
  parkwise_protections: "Does not mean regulated fund status or capital guarantees.",
  flexible_term: "Does not mean you can exit at will without Terms conditions."
};

export const DEFAULT_COMMERCIAL_TERM_IDS: CommercialTermId[] = [
  "triple_net",
  "contractual_monthly_rent",
  "indexation_floor",
  "parkwise_protections",
  "flexible_term"
];

/** Joined "A · B · C" structure summary for the detail-page Key terms block. */
export function keyTermsStructureSummary(termIds: CommercialTermId[]): string {
  return termIds.map((id) => COMMERCIAL_TERM_LABELS[id]).join(" · ");
}

export function isCommercialTermId(id: unknown): id is CommercialTermId {
  return typeof id === "string" && (COMMERCIAL_TERM_IDS as readonly string[]).includes(id);
}

export function validateCommercialTermIds(
  ids: unknown
): { ok: true; ids: CommercialTermId[] } | { ok: false; error: string } {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "commercialTermIds must be a non-empty array" };
  }
  const out: CommercialTermId[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!isCommercialTermId(id)) {
      return { ok: false, error: `unknown commercial term id: ${String(id)}` };
    }
    if (seen.has(id)) {
      return { ok: false, error: "duplicate commercial term id" };
    }
    seen.add(id);
    out.push(id);
  }
  return { ok: true, ids: out };
}

/**
 * "What's included" checklist for the detail page. Every line is derived
 * from data that already exists in the commercial terms catalogue and the
 * canonical presentation strings — and each term carries its "not meaning"
 * qualifier so the list stays honest (no claims beyond the data model).
 */

import {
  COMMERCIAL_TERM_LABELS,
  COMMERCIAL_TERM_NOT_MEANING,
  isCommercialTermId
} from "@/lib/assets/commercial-terms";
import { MISSING_TERM } from "@/lib/assets/presentation";

export type IncludedChecklistItem = { id: string; text: string; hint: string | null };

export function buildIncludedChecklist(input: {
  termIds: readonly string[];
  termDisplay: string;
  paymentFrequencyDisplay: string;
}): IncludedChecklistItem[] {
  const items: IncludedChecklistItem[] = [];

  for (const id of input.termIds) {
    if (!isCommercialTermId(id)) continue;
    items.push({
      id: `term-${id}`,
      text: COMMERCIAL_TERM_LABELS[id],
      hint: COMMERCIAL_TERM_NOT_MEANING[id]
    });
  }

  if (input.paymentFrequencyDisplay === "Monthly") {
    items.push({
      id: "monthly-distributions",
      text: "Target distributions paid monthly to your account",
      hint: "Monthly income is a target, not a guarantee — payments may be lower, delayed, or not paid."
    });
  }

  if (input.termDisplay && input.termDisplay !== MISSING_TERM) {
    items.push({ id: "term", text: `Term: ${input.termDisplay}`, hint: null });
  }

  items.push({
    id: "exit",
    text: "Exit: per the deal documents",
    hint: "No guaranteed exit and no capital guarantee."
  });

  return items;
}

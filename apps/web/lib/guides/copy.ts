/**
 * Centralized consumer copy for the guides area: the /guides index hero and
 * each article's hero lead + meta description.
 *
 * Voice: calm, concrete, risk-literate. Every article lead states the guide's
 * takeaway in the first paragraph. Compliance lines (risk, illustrative)
 * live in lib/copy/consumer.ts — reference them, never paraphrase or remove.
 * Never say "hubs" here; no advisory or promotional wording.
 */
import type { Guide } from "./catalog";

export const GUIDES_INDEX_COPY = {
  kicker: "Guides",
  title: "Read this before you invest",
  lead:
    "Plain-language guides on returns, risks, fees, and terms — including the parts that can work against you.",
  metaDescription:
    "Understand parking investments before you invest. Guides on returns, risks, fees, and how to read an opportunity."
} as const;

export interface GuideCopy {
  /** Hero lead — the guide's takeaway, stated as the first paragraph. */
  readonly lead: string;
  /** Meta description for search and social previews. */
  readonly description: string;
}

export const GUIDE_COPY: Record<Guide["slug"], GuideCopy> = {
  "how-to-read-a-parkwise-opportunity": {
    lead:
      "Every figure on a Parkwise page is a fact, a target, or a term. Once you can tell them apart, an opportunity page takes minutes to read — and is much harder to misread.",
    description:
      "A plain-language map of the labels on Parkwise opportunity cards and detail pages — what each one means, and what it does not promise."
  },
  "what-monthly-distributions-mean": {
    lead:
      "A monthly income figure is a target annual return divided by twelve, not a payment schedule. Some months can pay less, pay late, or not pay at all.",
    description:
      "What the monthly income figure on a Parkwise opportunity really is, why it can change, and why distributions are never guaranteed."
  },
  "how-hub-income-is-stacked": {
    lead:
      "Parking does the heavy lifting. EV charging and other extras count only when they are written into the opportunity terms — and every stream can fall short.",
    description:
      "Parking, EV charging, and other income streams on Parkwise opportunities. Capital at risk."
  },
  "parking-investment-risks": {
    lead:
      "Four risks decide most outcomes: income, capital, liquidity, and the operator. Parking is a familiar asset — that does not remove any of them.",
    description:
      "Income, capital, liquidity, and market risks of parking investments on Parkwise."
  },
  "can-you-exit-early": {
    lead:
      "Plan to hold for the full term. Where an early exit exists at all, it usually means finding a buyer — and possibly accepting less than you put in.",
    description:
      "How liquidity works for Parkwise parking investments and what early exit usually means."
  },
  "how-fees-affect-returns": {
    lead:
      "Fees are taken before anything reaches you. Parkwise charges no platform fee today, but costs inside an opportunity still reduce what is available to distribute.",
    description: "How fees can affect target returns on Parkwise opportunities."
  },
  "european-parking-and-mobility-2026": {
    lead:
      "Cars still fill European cities, and EU rules are building charging around them. Destination parking sits where those two facts meet — useful context, not a promise of returns.",
    description:
      "Public figures on European cars, charging, and AFIR — and how Parkwise parking opportunities fit. Capital at risk."
  }
};

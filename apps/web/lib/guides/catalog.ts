import { notFound } from "next/navigation";

export const GUIDE_CATEGORIES = [
  "Getting started",
  "Understanding returns",
  "Parking and mobility",
  "Risks",
  "Fees",
  "Investment terms"
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

export const GUIDES = [
  {
    slug: "how-to-read-a-parkwise-opportunity",
    title: "How to read a Parkwise opportunity",
    dek: "Labels, options, target returns, and what to check before you invest.",
    category: "Getting started",
    minutes: 4,
    reviewedAt: "2026-07-19"
  },
  {
    slug: "what-monthly-distributions-mean",
    title: "What monthly distributions actually mean",
    dek: "How example monthly income is calculated, and why it is not guaranteed.",
    category: "Understanding returns",
    minutes: 5,
    reviewedAt: "2026-07-19"
  },
  {
    slug: "how-hub-income-is-stacked",
    title: "How parking investments generate income",
    dek: "Parking, EV, and other income streams explained in plain words.",
    category: "Understanding returns",
    minutes: 5,
    reviewedAt: "2026-07-19"
  },
  {
    slug: "parking-investment-risks",
    title: "The main risks of parking investments",
    dek: "Income, capital, liquidity, and market risks in clear language.",
    category: "Risks",
    minutes: 6,
    reviewedAt: "2026-07-19"
  },
  {
    slug: "can-you-exit-early",
    title: "Can you exit early?",
    dek: "What holding periods mean and why early exits are usually limited.",
    category: "Investment terms",
    minutes: 4,
    reviewedAt: "2026-07-19"
  },
  {
    slug: "how-fees-affect-returns",
    title: "How fees affect returns",
    dek: "Where fees appear and how they can change example income.",
    category: "Fees",
    minutes: 4,
    reviewedAt: "2026-07-19"
  },
  {
    slug: "european-parking-and-mobility-2026",
    title: "European parking and mobility in 2026",
    dek: "Public figures on cars, charging, and AFIR, then how Parkwise fits.",
    category: "Parking and mobility",
    minutes: 8,
    reviewedAt: "2026-07-19"
  }
] as const satisfies ReadonlyArray<{
  slug: string;
  title: string;
  dek: string;
  category: GuideCategory;
  minutes: number;
  reviewedAt: string;
}>;

export const GUIDE_SLUGS = GUIDES.map((g) => g.slug);

export type Guide = (typeof GUIDES)[number];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/**
 * Guide article pages look their slug up at module scope; a catalog edit that
 * drops or renames a slug must 404 instead of crashing the render.
 */
export function getGuideOrNotFound(slug: string): Guide {
  const guide = getGuide(slug);
  if (!guide) notFound();
  return guide;
}

/** 2–3 related guides for cross-linking, same category first. */
export function relatedGuides(slug: string, count = 3): Guide[] {
  const self = getGuide(slug);
  if (!self) return [];
  const rest = GUIDES.filter((g) => g.slug !== slug);
  const sameCategory = rest.filter((g) => g.category === self.category);
  const others = rest.filter((g) => g.category !== self.category);
  return [...sameCategory, ...others].slice(0, count);
}

import type { Guide } from "./catalog";

/**
 * Article JSON-LD for guide pages. Pure builder (no next/headers) so it stays
 * unit-testable; pages render it via the async <JsonLd> component.
 */
export function articleJsonLd(guide: Guide) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.dek,
    dateModified: guide.reviewedAt,
    author: { "@type": "Organization", name: "Parkwise" }
  };
}

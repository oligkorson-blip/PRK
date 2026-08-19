/**
 * Brand photography fallback for opportunities without an uploaded cover image.
 * Maps the asset's site type to one of the generated brand photos so catalogue
 * cards and detail pages never fall back to the placeholder diagram. A seed
 * (usually the slug) spreads assets of the same type across photo variants.
 */

const TYPE_PHOTOS: Record<string, string[]> = {
  station: ["/assets/brand/hero-main.jpg"],
  airport: ["/assets/brand/type-airport.jpg"],
  city: ["/assets/brand/type-city.jpg"],
  retail: ["/assets/brand/type-city.jpg"]
};

const DEFAULT_PHOTOS = ["/assets/brand/hero-main.jpg", "/assets/brand/type-city.jpg"];

/** Seed data points at this placeholder until ops uploads real photography. */
export const PLACEHOLDER_COVER = "/assets/parking-placeholder.svg";

export function isPlaceholderCover(url?: string | null): boolean {
  return !url || url.trim() === "" || url.trim() === PLACEHOLDER_COVER;
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function assetTypePhoto(siteType?: string | null, seed?: string | null): string {
  const pool =
    (siteType ? TYPE_PHOTOS[siteType.trim().toLowerCase()] : undefined) ?? DEFAULT_PHOTOS;
  if (!seed) return pool[0];
  return pool[hashSeed(seed) % pool.length];
}

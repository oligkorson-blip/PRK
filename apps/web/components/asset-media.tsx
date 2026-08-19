import { assetTypePhoto, isPlaceholderCover } from "@/lib/assets/type-photo";

function isSafeImageUrl(url: string): boolean {
  if (url.startsWith("//")) return false;
  if (url.startsWith("/")) return !url.includes("://");
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export function AssetMedia({
  src,
  alt,
  siteType,
  seed,
  className
}: {
  src?: string | null;
  alt: string;
  /** Used to pick the brand-photo fallback when no cover image is set. */
  siteType?: string | null;
  /** Spreads same-type assets across the photo variants (use the slug). */
  seed?: string | null;
  className?: string;
}) {
  const url =
    src && !isPlaceholderCover(src) && isSafeImageUrl(src)
      ? src
      : assetTypePhoto(siteType, seed);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- optional remote ops URLs; next/image domains unknown
    <img className={className ?? "asset-media-img"} src={url} alt={alt} loading="lazy" />
  );
}

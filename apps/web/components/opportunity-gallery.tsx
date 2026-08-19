"use client";

import { useState } from "react";
import { assetTypePhoto, isPlaceholderCover } from "@/lib/assets/type-photo";

export function OpportunityGallery({
  variant = 0,
  name,
  city,
  coverImageUrl,
  galleryImageUrls = [],
  siteType,
  coverImageCaption
}: {
  variant?: number;
  name: string;
  city: string;
  coverImageUrl?: string | null;
  galleryImageUrls?: string[];
  siteType?: string | null;
  coverImageCaption?: string | null;
}) {
  const uploaded = [coverImageUrl, ...galleryImageUrls].filter(
    (u): u is string => Boolean(u && u.trim() && !isPlaceholderCover(u))
  );
  const hasPhotos = uploaded.length > 0;
  // No uploaded photography yet — show the brand type photo rather than a diagram.
  const photos = hasPhotos ? uploaded : [assetTypePhoto(siteType, name)];
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleIndex = Math.min(activeIndex, photos.length - 1);
  const caption = coverImageCaption?.trim() || null;

  return (
    <div className="opp-gallery" aria-label={`Visuals for ${name}`}>
      <div className="opp-gallery-main">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="asset-media-img"
          src={photos[visibleIndex]}
          alt={hasPhotos ? `${name} view ${visibleIndex + 1} in ${city}` : ""}
          loading="lazy"
        />
      </div>
      {hasPhotos && photos.length > 1 ? (
        <div className="opp-gallery-thumbs">
          {photos.slice(0, 4).map((src, i) => (
            <button
              className={`opp-gallery-thumb${visibleIndex === i ? " is-selected" : ""}`}
              key={`${src}-${i}`}
              type="button"
              aria-label={`Show ${name} view ${i + 1}`}
              aria-pressed={visibleIndex === i}
              onClick={() => setActiveIndex(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="asset-media-img"
                src={src}
                alt=""
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : null}
      {caption ? <p className="opp-gallery-caption">{caption}</p> : null}
      <p className="field-hint">
        {hasPhotos
          ? "Site imagery for orientation. Always read the opportunity documents before you invest."
          : "Illustrative photo of a comparable site. Final diligence uses opportunity documents and operator materials."}
      </p>
    </div>
  );
}

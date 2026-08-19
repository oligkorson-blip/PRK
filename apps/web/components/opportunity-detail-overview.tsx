import { OpportunityGallery } from "@/components/card-art";

export function OpportunityDetailOverview({
  artVariant,
  name,
  city,
  coverImageUrl,
  galleryImageUrls,
  siteType,
  coverImageCaption,
  blurb,
  spaces,
  operatorLabel,
  termDisplay
}: {
  artVariant?: number | null;
  name: string;
  city: string;
  coverImageUrl?: string | null;
  galleryImageUrls?: string[];
  siteType?: string | null;
  coverImageCaption?: string | null;
  blurb: string;
  spaces: number;
  operatorLabel: string;
  termDisplay: string;
}) {
  return (
    <section id="overview" className="detail-block detail-block-story">
      <p className="detail-section-kicker">The opportunity</p>
      <h2 className="h3">What you&apos;re looking at</h2>
      <p className="lead detail-blurb">{blurb}</p>
      <ul className="detail-facts">
        <li>
          <strong>{spaces.toLocaleString("en-IE")}</strong>
          <span>Parking spaces</span>
        </li>
        <li>
          <strong>{operatorLabel}</strong>
          <span>Operator</span>
        </li>
        <li>
          <strong>{termDisplay}</strong>
          <span>Term</span>
        </li>
        {siteType ? (
          <li>
            <strong>{siteType}</strong>
            <span>Place type</span>
          </li>
        ) : null}
      </ul>
      <div className="detail-overview-gallery">
        <OpportunityGallery
          variant={artVariant ?? 0}
          name={name}
          city={city}
          coverImageUrl={coverImageUrl}
          galleryImageUrls={galleryImageUrls}
          siteType={siteType}
          coverImageCaption={coverImageCaption}
        />
      </div>
    </section>
  );
}

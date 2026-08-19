import {
  communitySpaceTypeLabel,
  type CommunitySpaceType
} from "@/lib/community-spaces/types";

type CommunitySpace = {
  id: string;
  title: string;
  hostLabel: string;
  spaceType: CommunitySpaceType;
  city: string;
  district: string;
  country: string;
  description: string;
  accessNotes: string;
  monthlyPriceEur: number;
  features: string[];
};

function requestHref(title: string): string {
  return "mailto:contact@parkwise.eu?subject=" + encodeURIComponent("Parking availability: " + title);
}

export function CommunitySpaceCard({ space }: { space: CommunitySpace }) {
  return (
    <article className="community-space-card">
      <div className="community-space-card-head">
        <span className="badge badge-status-confirmed">{communitySpaceTypeLabel(space.spaceType)}</span>
        <span className="community-space-verified">Verified listing</span>
      </div>
      <h2>{space.title}</h2>
      <p className="community-space-card-location">
        {space.district ? space.district + ", " : ""}{space.city}, {space.country}
      </p>
      <p className="community-space-card-host">Hosted by {space.hostLabel}</p>
      <p>{space.description || "A privately supplied parking space in a convenient local area."}</p>
      {space.accessNotes ? <p className="field-hint">{space.accessNotes}</p> : null}
      {space.features.length > 0 ? (
        <ul className="community-space-features">
          {space.features.map((feature) => <li key={feature}>{feature}</li>)}
        </ul>
      ) : null}
      <div className="community-space-card-price">
        €{space.monthlyPriceEur.toLocaleString("en-IE")} <span>/ month</span>
      </div>
      <div className="community-space-card-actions">
        <a className="btn btn-primary" href={requestHref(space.title)}>Request availability</a>
        <span className="field-hint">Manual confirmation for now</span>
      </div>
    </article>
  );
}

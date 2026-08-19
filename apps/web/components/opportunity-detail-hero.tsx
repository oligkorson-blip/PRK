import Link from "next/link";
import { AssetMedia } from "@/components/asset-media";
import { RISK_LINE_SHORT } from "@/lib/copy/consumer";
import type { OpportunityPresentation } from "@/lib/assets/presentation";

export function OpportunityDetailHero({
  presentation,
  name,
  location,
  siteType,
  coverImageUrl,
  assetSlug
}: {
  presentation: OpportunityPresentation;
  name: string;
  location: string;
  siteType?: string | null;
  coverImageUrl?: string | null;
  assetSlug: string;
}) {
  return (
    <section className="page-intro page-intro-functional page-hero page-hero-compact opp-detail-hero">
      <div className="container opp-detail-hero-grid">
        <div className="opp-detail-hero-copy">
          <p className="field-hint opp-detail-crumb">
            <Link href="/opportunities">Opportunities</Link>
            <span aria-hidden="true"> / </span>
            <span>{name}</span>
          </p>
          <span className="kicker">{presentation.operatorLabel}</span>
          <h1 className="display-m opp-detail-title">{name}</h1>
          <p className="lead opp-detail-location">
            {location}
            {siteType ? ` · ${siteType}` : ""}
          </p>
          <p className="opp-detail-status">
            <span className={presentation.status.badgeClass}>{presentation.status.label}</span>
            <span className="sr-only">{presentation.status.a11yLabel}</span>
          </p>
        </div>

        <div className="opp-detail-hero-media">
          <AssetMedia
            src={coverImageUrl}
            alt=""
            siteType={siteType}
            seed={assetSlug}
          />
        </div>

        <div className="opp-detail-hero-metrics">
          <div className="hero-key-numbers">
            {presentation.yieldDisplay ? (
              <div>
                <span className="metric-label">Target return</span>
                <b>{presentation.yieldDisplay}</b>
              </div>
            ) : null}
            <div>
              <span className="metric-label">From</span>
              <b>{presentation.minTicketDisplay ?? "—"}</b>
            </div>
            <div>
              <span className="metric-label">Payments</span>
              <b>{presentation.paymentFrequencyDisplay}</b>
            </div>
            <div>
              <span className="metric-label">Term</span>
              <b>{presentation.termDisplay}</b>
            </div>
          </div>
          <p className="field-hint opp-detail-disclose risk-line">{RISK_LINE_SHORT}</p>
          <p className="opp-detail-hero-jump">
            <a className="btn btn-lime btn-sm" href="#returns">
              See options
            </a>
            <a className="btn btn-ghost-light btn-sm" href="#overview">
              Read the story
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

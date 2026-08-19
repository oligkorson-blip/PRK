import Link from "next/link";
import { AssetMedia } from "@/components/asset-media";
import { FundingBar } from "@/components/funding-bar";
import { RISK_LINE_SHORT } from "@/lib/copy/consumer";
import {
  listFieldsToPresentationInput,
  type OpportunityListFields
} from "@/lib/assets/list-fields";
import {
  buildOpportunityPresentation,
  siteTypeDisplay
} from "@/lib/assets/presentation";

export type AssetCardData = OpportunityListFields;

export type AssetCardVariant = "default" | "homepage";

/** One short place line for catalogue cards — keep scannable. */
export function cardPlaceHook(blurb?: string | null, maxChars = 110): string | null {
  const trimmed = blurb?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars).replace(/\s+\S*$/, "").trimEnd();
  return cut.length > 0 ? `${cut}…` : `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

function showCatalogueFunding(
  funding: NonNullable<OpportunityListFields["funding"]> | null | undefined,
  showFunding: boolean
): boolean {
  if (!showFunding || !funding) return false;
  // Hide empty progress — €0 of €Xm reads as abandoned, not open.
  if (funding.open && funding.committedEur <= 0) return false;
  return true;
}

export function AssetCard({
  asset,
  variant = "default",
  onQuickView
}: {
  asset: AssetCardData;
  variant?: AssetCardVariant;
  /** When provided, renders a "Quick view" button overlaid on the card art. */
  onQuickView?: (asset: AssetCardData) => void;
}) {
  const homepage = variant === "homepage";
  const presentation = buildOpportunityPresentation(listFieldsToPresentationInput(asset));
  const { status, yieldDisplay, minTicketDisplay, paymentFrequencyDisplay, termDisplay } =
    presentation;
  const placeHook = !homepage ? cardPlaceHook(asset.blurb) : null;
  const fundingVisible =
    !homepage && showCatalogueFunding(presentation.funding, presentation.showFunding);

  const badges: { key: string; label: string; className: string; a11y: string }[] = homepage
    ? []
    : [
        {
          key: "status",
          label: status.label,
          className: status.badgeClass,
          a11y: status.a11yLabel
        }
      ];
  const siteTypeLabel = siteTypeDisplay(asset.siteType);
  if (!homepage && siteTypeLabel && badges.length < 2) {
    badges.push({
      key: "site",
      label: siteTypeLabel,
      className: "badge badge-dark",
      a11y: `Place type: ${siteTypeLabel}`
    });
  }

  return (
    <article
      className={`asset-card asset-card-consumer${homepage ? " asset-card-homepage" : ""}`}
    >
      <Link
        className="asset-card-link"
        href={`/opportunities/${asset.slug}`}
        aria-label={`View details for ${asset.name}`}
      >
        <div className="asset-card-art">
          <AssetMedia
            src={asset.coverImageUrl}
            alt=""
            siteType={asset.siteType}
            seed={asset.slug}
          />
        </div>
        {badges.length > 0 ? (
          <div className="asset-card-tags">
            {badges.map((b) => (
              <span key={b.key} className={b.className} aria-label={b.a11y}>
                {b.label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="asset-card-body">
          {!homepage ? (
            <p className="field-hint asset-card-lane">Provider-managed investment opportunity</p>
          ) : null}
          <h3 className="asset-card-name">{asset.name}</h3>
          <p className="asset-card-loc">
            {homepage
              ? presentation.locationLabel
              : `${presentation.locationLabel}${presentation.siteType ? ` · ${presentation.siteType}` : ""}`}
          </p>
          {placeHook ? <p className="asset-card-hook">{placeHook}</p> : null}
          {yieldDisplay ? (
            <div className="asset-card-metric-primary">
              <span className="metric-label">Target return</span>
              <b>{yieldDisplay}</b>
            </div>
          ) : null}
          {homepage ? (
            minTicketDisplay ? (
              <p className="asset-card-from">
                From <b>{minTicketDisplay}</b>
              </p>
            ) : null
          ) : (
            <div className="asset-card-stats">
              {minTicketDisplay ? (
                <div>
                  <span className="metric-label">From</span>
                  <b>{minTicketDisplay}</b>
                </div>
              ) : null}
              <div>
                <span className="metric-label">Payments</span>
                <b>{paymentFrequencyDisplay}</b>
              </div>
              <div>
                <span className="metric-label">Term</span>
                <b>{termDisplay}</b>
              </div>
            </div>
          )}
          {fundingVisible && presentation.funding ? (
            <FundingBar funding={presentation.funding} />
          ) : null}
          {!homepage ? (
            <p className="field-hint asset-card-disclaimer risk-line">{RISK_LINE_SHORT}</p>
          ) : null}
          <span className={homepage ? "asset-card-cta-link" : "btn btn-primary btn-sm asset-card-cta"}>
            {homepage ? "Explore" : "View details"}
            {homepage ? <span className="arrow"> →</span> : null}
          </span>
        </div>
      </Link>
      {onQuickView ? (
        <button
          type="button"
          className="asset-card-quick-view"
          onClick={() => onQuickView(asset)}
          aria-label={`Quick view of ${asset.name}`}
        >
          Quick view
        </button>
      ) : null}
    </article>
  );
}

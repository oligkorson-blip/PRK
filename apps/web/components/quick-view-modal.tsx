"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { AssetMedia } from "@/components/asset-media";
import { FundingBar } from "@/components/funding-bar";
import { cardPlaceHook, type AssetCardData } from "@/components/asset-card";
import { listFieldsToPresentationInput } from "@/lib/assets/list-fields";
import { buildOpportunityPresentation } from "@/lib/assets/presentation";
import { buildStatTiles } from "@/lib/assets/stat-tiles";
import { RISK_LINE_SHORT } from "@/lib/copy/consumer";

const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

function showQuickViewFunding(
  funding: NonNullable<AssetCardData["funding"]> | null | undefined,
  showFunding: boolean
): boolean {
  if (!showFunding || !funding) return false;
  if (funding.open && funding.committedEur <= 0) return false;
  return true;
}

export function QuickViewModal({
  asset,
  onClose
}: {
  asset: AssetCardData;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const presentation = buildOpportunityPresentation(listFieldsToPresentationInput(asset));
  const placeHook = cardPlaceHook(asset.blurb, 160);
  const fundingVisible = showQuickViewFunding(presentation.funding, presentation.showFunding);
  const tiles = buildStatTiles(
    {
      spaces: asset.spaces,
      availableSpaces: asset.availableSpaces,
      occupancyPct: asset.occupancyPct,
      visitorsPerDay: asset.visitorsPerDay,
      visitorsProvenance: asset.visitorsProvenance,
      annualRevenueEur: asset.annualRevenueEur,
      revenueProvenance: asset.revenueProvenance,
      termDisplay: presentation.termDisplay
    },
    { includeTerm: true, limit: 3 }
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="quick-view-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="quick-view-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="quick-view-close"
          onClick={onClose}
          aria-label="Close quick view"
        >
          ×
        </button>
        <div className="quick-view-art">
          <AssetMedia src={asset.coverImageUrl} alt="" siteType={asset.siteType} seed={asset.slug} />
        </div>
        <div className="quick-view-body">
          <div>
            <h2 id={titleId} className="h3 quick-view-name">
              {asset.name}
            </h2>
            <p className="asset-card-loc">
              {presentation.locationLabel}
              {presentation.siteType ? ` · ${presentation.siteType}` : ""}
            </p>
            {placeHook ? <p className="asset-card-hook">{placeHook}</p> : null}
          </div>

          <dl className="quick-view-facts">
            <div>
              <dt>Target return</dt>
              <dd>{presentation.yieldDisplay ?? "See opportunity details"}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>{presentation.minTicketDisplay ?? "See opportunity details"}</dd>
            </div>
            <div>
              <dt>Term</dt>
              <dd>{presentation.termDisplay}</dd>
            </div>
          </dl>

          {fundingVisible && presentation.funding ? (
            <FundingBar funding={presentation.funding} />
          ) : null}

          {tiles.length > 0 ? (
            <div className="stat-tile-row stat-tile-row-compact" aria-label="Key asset figures">
              {tiles.map((tile) => (
                <div className="stat-tile" key={tile.label}>
                  <b className="stat-tile-value">{tile.value}</b>
                  <span className="stat-tile-label">{tile.label}</span>
                  {tile.hint ? (
                    <span className="field-hint stat-tile-hint">{tile.hint}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <p className="field-hint risk-line">{RISK_LINE_SHORT}</p>

          <div className="quick-view-actions">
            <Link className="btn btn-primary" href={`/opportunities/${asset.slug}`}>
              View full details →
            </Link>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

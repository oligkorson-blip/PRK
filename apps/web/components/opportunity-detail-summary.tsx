import { formatEur, formatYieldPct } from "@/lib/format";
import type { DetailCtaDecision } from "@/lib/copy/cta";
import type { FundingSnapshot } from "@/lib/assets/funding";
import type { InvestmentOption } from "@/lib/assets/investment-options";
import type { OpportunityPresentation } from "@/lib/assets/presentation";
import { FundingBar } from "@/components/funding-bar";
import { AllocationCta } from "@/components/opportunity-detail-cta";
import { OPPORTUNITY_FEE_SUMMARY } from "@/lib/copy/consumer";

function showDetailFunding(
  funding: FundingSnapshot | null | undefined,
  showFunding: boolean
): boolean {
  if (!showFunding || !funding) return false;
  if (funding.open && funding.committedEur <= 0) return false;
  return true;
}

export function DecisionSummary({
  presentation,
  selected,
  funding,
  cta,
  assetSlug,
  showFunding,
  termsSeen = true
}: {
  presentation: OpportunityPresentation;
  selected: InvestmentOption;
  funding: FundingSnapshot | null | undefined;
  cta: DetailCtaDecision;
  assetSlug: string;
  showFunding: boolean;
  /** Scroll-gate: interest form unlocks after terms/risks enter the viewport. */
  termsSeen?: boolean;
}) {
  const fundingVisible = showDetailFunding(funding, showFunding);

  return (
    <>
      <p className="detail-side-kicker">Your selection</p>
      <p className="detail-side-status">
        <span className={presentation.status.badgeClass}>{presentation.status.label}</span>
      </p>
      <div className="detail-side-metric">
        <span className="metric-label">Option</span>
        <b>{selected.id === "green" ? "EV option" : selected.label}</b>
      </div>
      <div className="detail-side-metric">
        <span className="metric-label">From</span>
        <b>{formatEur(selected.minTicketEur)}</b>
      </div>
      <div className="detail-side-metric">
        <span className="metric-label">Target return</span>
        <b>{formatYieldPct(selected.yieldPct)}</b>
      </div>
      <div className="detail-side-metric">
        <span className="metric-label">Payments</span>
        <b>{presentation.paymentFrequencyDisplay}</b>
      </div>
      <div className="detail-side-metric">
        <span className="metric-label">Term</span>
        <b>{presentation.termDisplay}</b>
      </div>
      <div className="detail-side-fees">
        <span className="metric-label">Fees</span>
        <p>
          {OPPORTUNITY_FEE_SUMMARY}{" "}
          <a href="#terms">See terms</a>
        </p>
      </div>
      {fundingVisible && funding ? (
        <div className="detail-side-funding">
          <FundingBar funding={funding} />
        </div>
      ) : null}
      <ul className="detail-side-links">
        <li>
          <a href="#risks">Key risks</a>
        </li>
        <li>
          <a href="#liquidity">Liquidity and exit</a>
        </li>
        <li>
          <a href="#documents">Documents</a>
        </li>
        <li>
          <a href="#faq">FAQ</a>
        </li>
      </ul>
      <div className="detail-side-actions">
        <AllocationCta
          cta={cta}
          assetSlug={assetSlug}
          selected={selected}
          termsSeen={termsSeen}
        />
      </div>
    </>
  );
}

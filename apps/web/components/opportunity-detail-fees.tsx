import Link from "next/link";
import { buildIncludedChecklist } from "@/lib/assets/included-checklist";
import type { CommercialTermId } from "@/lib/assets/commercial-terms";
import { OPPORTUNITY_FEE_SUMMARY } from "@/lib/copy/consumer";

export function OpportunityDetailFees({
  termIds,
  termDisplay,
  paymentFrequencyDisplay
}: {
  termIds: CommercialTermId[];
  termDisplay: string;
  paymentFrequencyDisplay: string;
}) {
  const items = buildIncludedChecklist({ termIds, termDisplay, paymentFrequencyDisplay });

  return (
    <section id="terms" className="detail-block">
      <p className="detail-section-kicker">Terms</p>
      <h2 className="h3">What&apos;s in the deal</h2>
      <p className="detail-section-lead">
        A plain summary of structure, protections, fees, and exit. The deal documents have the
        final word.
      </p>

      {items.length > 0 ? (
        <ul className="included-checklist">
          {items.map((item) => (
            <li key={item.id}>
              <span className="included-marker" aria-hidden="true">
                ✓
              </span>
              <span className="included-text">
                {item.text}
                {item.hint ? <span className="field-hint">{item.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="h4 stack-8">Fees and costs</h3>
      <p>
        {OPPORTUNITY_FEE_SUMMARY} Where a figure is shown net of listed fees, the page says so;
        otherwise treat displayed targets as before costs and read the documents for the exact
        treatment.
      </p>
      <p>
        <Link className="link-arrow" href="/fees">
          Read the fees overview →
        </Link>
      </p>

      <h3 id="liquidity" className="h4 stack-8">
        Term, liquidity, and exit
      </h3>
      <p>
        Plan to hold for the stated term on this listing (<strong>{termDisplay}</strong>).
        Parking investments are typically illiquid. Any early exit usually depends on finding a
        buyer and may involve a discount. Planned exit terms, where offered, are described in the
        deal documents — an exit is not guaranteed.
      </p>
    </section>
  );
}

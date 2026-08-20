import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import {
  FEE_TERMINOLOGY_LINE,
  FEES_BENEFIT_LEAD,
  FEES_CHECKLIST,
  NO_PLATFORM_FEE_LINE
} from "@/lib/copy/consumer";

export const metadata: Metadata = {
  title: "Fees",
  description: "How fees work on Parkwise and how they can affect target returns."
};

export default function FeesPage() {
  return (
    <main>
      <PageIntro
        variant="functional"
        kicker="Fees"
        title="Fees, in plain terms"
        lead={FEES_BENEFIT_LEAD}
      />
      <section className="section">
        <div className="container container-narrow">
          <div className="grid-2">
            <article className="info-card">
              <h3>Platform fee</h3>
              <p>
                Parkwise does not charge you a platform fee today. That is not the same as no costs
                at all — any costs sit with the individual opportunity.
              </p>
            </article>
            <article className="info-card">
              <h3>Opportunity fees and costs</h3>
              <p>
                Structuring, administration, operating, and exit costs vary from place to place.
                The amount, who pays it, when it falls due, and what it means for your return are
                set out in the opportunity documents before you invest.
              </p>
            </article>
          </div>
          <div className="info-card section-foot">
            <h2 className="display-s">How to read the figures</h2>
            <p>{FEE_TERMINOLOGY_LINE}</p>
            <ul className="risk-list">
              <li>Check whether each target is shown gross or net of the listed fees.</li>
              <li>Check who pays each cost, and when it falls due.</li>
              <li>Taxes and personal bank charges sit outside Parkwise fees entirely.</li>
            </ul>
            <p>{NO_PLATFORM_FEE_LINE}</p>
          </div>
          <div className="risk-panel section-foot">
            <h2 className="display-s">Before you invest: a short checklist</h2>
            <ul className="risk-list">
              {FEES_CHECKLIST.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="apply-actions stack-6">
              <Link className="btn btn-primary" href="/apply">
                Apply to view opportunities <span className="arrow">→</span>
              </Link>
              <Link className="btn btn-ghost" href="/contact">
                Talk to the team <span className="arrow">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

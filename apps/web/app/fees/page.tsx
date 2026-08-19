import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import {
  FEE_TERMINOLOGY_LINE,
  NO_PLATFORM_FEE_LINE,
  RISK_LINE
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
        lead={NO_PLATFORM_FEE_LINE}
      />
      <section className="section">
        <div className="container container-narrow">
          <div className="grid-2">
            <article className="info-card">
              <h3>Platform fee</h3>
              <p>
                Parkwise does not charge a platform fee today. This does not mean that an underlying
                opportunity has no costs.
              </p>
            </article>
            <article className="info-card">
              <h3>Opportunity fees and costs</h3>
              <p>
                The amount, type, payer, timing, and effect of any structuring, administration,
                operating, or exit costs are set out in the opportunity documents before you invest.
              </p>
            </article>
          </div>
          <div className="info-card section-foot">
            <h2 className="display-s">How to read the figures</h2>
            <p>{FEE_TERMINOLOGY_LINE}</p>
            <ul className="risk-list">
              <li>Check whether each target is shown gross or net of listed opportunity fees.</li>
              <li>Check who pays each cost and when it is charged.</li>
              <li>Taxes and personal bank charges are separate from Parkwise fees.</li>
            </ul>
            <p>{NO_PLATFORM_FEE_LINE}</p>
          </div>
          <div className="risk-panel section-foot">
            <h2 className="display-s">Important</h2>
            <ul className="risk-list">
              <li>Fee schedules can differ by opportunity.</li>
              <li>Read the opportunity documents before investing.</li>
              <li>{RISK_LINE}</li>
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

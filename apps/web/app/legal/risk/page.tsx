import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL_META } from "@/lib/copy/legal-meta";
import { formatDateDdMmYyyy } from "@/lib/format";

export const metadata: Metadata = {
  title: LEGAL_META.risk.title,
  description: LEGAL_META.risk.description
};

import {
  COMMERCIAL_TERM_IDS,
  COMMERCIAL_TERM_LABELS,
  COMMERCIAL_TERM_NOT_MEANING
} from "@/lib/assets/commercial-terms";
import {
  BUYBACK_ENABLED,
  COI_DISCLOSURE,
  HOLDING_MEANING,
  PERIMETER_STATEMENT,
  RISK_LINE_SHORT
} from "@/lib/copy/posture";

export default function RiskDisclosurePage() {
  const termIds = BUYBACK_ENABLED
    ? COMMERCIAL_TERM_IDS
    : COMMERCIAL_TERM_IDS.filter((id) => id !== "buyback_at_par");

  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Legal</span>
          <h1 className="display-l">Risk disclosure</h1>
          <p className="lead">
            Capital is at risk. Read this before you apply or invest.
          </p>
          <p className="field-hint stack-3">Last updated {formatDateDdMmYyyy(LEGAL_META.risk.effective)}.</p>
        </div>
      </section>
      <section className="section legal-content">
        <div className="container prose-legal">
          <p>
            <strong>Perimeter.</strong> {PERIMETER_STATEMENT}
          </p>
          <p>
            <strong>Capital at risk.</strong> Investments linked to parking and mobility assets can
            result in partial or total loss of capital. Target returns and monthly income figures are
            targets under Parkwise Terms. They are not guarantees, forecasts of your personal tax
            position, or promises of liquidity or payouts.
          </p>
          <p>
            <strong>Non-binding interest.</strong> Choosing an investment does not create a funded
            position or obligate Parkwise to confirm it. Confirmation, if any, follows identity
            checks and operational review.
          </p>
          <p>
            <strong>Confirmed investments.</strong> {HOLDING_MEANING}
          </p>
          <p>
            <strong>Conflicts.</strong> {COI_DISCLOSURE}
          </p>
          <p>
            <strong>Modelled metrics.</strong> Visitors/day and annual revenue marked “modelled” are
            internal catalogue figures — not audited accounts. Do not treat them as equal evidence to
            a target return under Parkwise Terms.
          </p>
          <p>
            <strong>Operational &amp; market risks.</strong> Occupancy, concession terms, operator
            performance, EV utilisation, regulation, and local demand can all reduce outcomes versus
            catalogue targets.
          </p>
          <p>
            <strong>Liquidity &amp; buyback.</strong> There is no assurance of an early exit.
            {!BUYBACK_ENABLED
              ? " Buyback is not offered on this release."
              : " Buyback applies only where an option includes it and Terms allow."}
          </p>
          <h2 className="h3">What the deal terms mean</h2>
          <p>
            Asset pages list commercial bullets with a plain “not meaning” line. Each item below
            restates what it means, what it does not mean, and what can go wrong.
          </p>
          {termIds.map((id) => (
            <div key={id} className="risk-term-block">
              <h3 className="h4">{COMMERCIAL_TERM_LABELS[id]}</h3>
              <p>
                <strong>Meaning.</strong> A commercial characteristic that may be included in a
                selected investment option under Parkwise Terms.
              </p>
              <p>
                <strong>Not meaning.</strong> {COMMERCIAL_TERM_NOT_MEANING[id]}
              </p>
              <p>
                <strong>Failure modes.</strong> Operator default, lease change, incomplete
                documentation, or Terms conditions that limit or remove the benefit.
              </p>
            </div>
          ))}
          <p>
            See also <Link href="/legal/terms">Platform terms</Link> and{" "}
            <Link href="/legal/privacy">Privacy</Link>. {RISK_LINE_SHORT}
          </p>
        </div>
      </section>
    </main>
  );
}

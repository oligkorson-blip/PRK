import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
import { articleJsonLd } from "@/lib/guides/article-jsonld";
import { getGuideOrNotFound } from "@/lib/guides/catalog";
import { RISK_LINE } from "@/lib/copy/consumer";
import { formatDateDdMmYyyy } from "@/lib/format";

const GUIDE = getGuideOrNotFound("parking-investment-risks");

export const metadata: Metadata = {
  title: "The main risks of parking investments",
  description:
    "Income, capital, liquidity, and market risks of parking investments on Parkwise."
};

export default function ParkingRisksGuidePage() {
  return (
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Risks</span>
          <h1 className="display-l">The main risks of parking investments</h1>
          <p className="lead">
            Parking can be a clear, real-world asset. It is still an investment that can lose money.
          </p>
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {formatDateDdMmYyyy(GUIDE.reviewedAt)}
          </p>
        </div>
      </section>
      <article className="section">
        <div className="container prose-legal guide-article">
          <h2>Income risk</h2>
          <p>
            Target returns can miss. Monthly income may be lower, delayed, or not paid.
          </p>
          <h2>Capital risk</h2>
          <p>You may lose some or all of the money you invest.</p>
          <h2>Liquidity risk</h2>
          <p>
            These investments are usually long-term. Selling early can be difficult and may require a
            discount.
          </p>
          <h2>Operational and market risk</h2>
          <p>
            Operator performance, local competition, regulation, and city policy can all affect
            results. Not every parking asset performs the same.
          </p>
          <p>
            <Link href="/legal/risk">Read the full risk disclosure</Link> ·{" "}
            <Link href="/apply">Apply to view opportunities</Link>
          </p>
          <p className="field-hint guide-footer">{RISK_LINE}</p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
    </main>
  );
}

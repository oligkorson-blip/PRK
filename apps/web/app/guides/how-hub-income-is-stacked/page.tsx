import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
import { articleJsonLd } from "@/lib/guides/article-jsonld";
import { getGuideOrNotFound } from "@/lib/guides/catalog";
import { formatDateDdMmYyyy } from "@/lib/format";

const GUIDE = getGuideOrNotFound("how-hub-income-is-stacked");

export const metadata: Metadata = {
  title: "How parking investments generate income",
  description:
    "Parking, EV charging, and other income streams on Parkwise opportunities. Capital at risk."
};

export default function HubIncomeGuidePage() {
  return (
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Understanding returns</span>
          <h1 className="display-l">How parking investments generate income</h1>
          <p className="lead">
            Parking is the primary stream. Everything else is additive only when it is written into
            the opportunity terms.
          </p>
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {formatDateDdMmYyyy(GUIDE.reviewedAt)}
          </p>
        </div>
      </section>

      <article className="section">
        <div className="container prose-legal guide-article">
          <h2 className="h3">Core parking</h2>
          <p>
            Short-stay, long-stay, and season tickets drive most income on Parkwise parking assets.
            Occupancy and pricing are what drive it.
          </p>
          <h2 className="h3">EV charging</h2>
          <p>
            Where EV charging appears in the income mix, it's an extra contracted stream — real
            income from that site, not a separate “green” promise.
          </p>
          <h2 className="h3">Other add-ons</h2>
          <p>
            Bike storage, lockers, fleet bays, or micromobility charging may appear when they earn.
            Opportunity cards keep those details light — open the full page for the income mix.
          </p>
          <p>
            <Link href="/apply">Apply to view opportunities</Link> ·{" "}
            <Link href="/legal/risk">Risk disclosure</Link>
          </p>
          <p className="field-hint guide-footer">
            Figures on opportunity pages are targets, not guarantees. Capital at risk.
          </p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
    </main>
  );
}

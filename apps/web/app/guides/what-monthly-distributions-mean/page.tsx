import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
import { articleJsonLd } from "@/lib/guides/article-jsonld";
import { getGuideOrNotFound } from "@/lib/guides/catalog";
import { RISK_LINE } from "@/lib/copy/consumer";
import { formatDateDdMmYyyy } from "@/lib/format";

const GUIDE = getGuideOrNotFound("what-monthly-distributions-mean");

export const metadata: Metadata = {
  title: "What monthly distributions actually mean",
  description:
    "Understand target monthly income on Parkwise opportunities, and why distributions are never guaranteed."
};

export default function MonthlyDistributionsGuidePage() {
  return (
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Understanding returns</span>
          <h1 className="display-l">What monthly distributions actually mean</h1>
          <p className="lead">
            Opportunity pages often show an illustrative monthly income figure. Here is what that
            number is, and what it is not.
          </p>
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {formatDateDdMmYyyy(GUIDE.reviewedAt)}
          </p>
        </div>
      </section>
      <article className="section">
        <div className="container prose-legal guide-article">
          <h2>A target, not a promise</h2>
          <p>
            Monthly income figures on Parkwise are usually calculated from a target annual return
            divided across twelve months. They help you compare opportunities. They do not guarantee
            that cash will arrive every month.
          </p>
          <h2>What can change the amount</h2>
          <ul>
            <li>Lower occupancy or weaker pricing at the site</li>
            <li>Higher operating costs</li>
            <li>Fees and timing differences</li>
            <li>Delays in recording or distributing available income</li>
          </ul>
          <h2>How to use the calculator</h2>
          <p>
            Treat calculator outputs as illustrations before tax. Always read the opportunity terms
            and risk disclosure before you invest.
          </p>
          <p>
            <Link href="/apply">Apply to view opportunities</Link> ·{" "}
            <Link href="/legal/risk">Risk disclosure</Link>
          </p>
          <p className="field-hint guide-footer">{RISK_LINE}</p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
    </main>
  );
}

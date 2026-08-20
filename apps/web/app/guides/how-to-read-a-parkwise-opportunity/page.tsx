import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
import { articleJsonLd } from "@/lib/guides/article-jsonld";
import { getGuideOrNotFound } from "@/lib/guides/catalog";
import { RISK_LINE } from "@/lib/copy/consumer";
import { formatDateDdMmYyyy } from "@/lib/format";
import { GUIDE_COPY } from "@/lib/guides/copy";

const GUIDE = getGuideOrNotFound("how-to-read-a-parkwise-opportunity");
const COPY = GUIDE_COPY["how-to-read-a-parkwise-opportunity"];

export const metadata: Metadata = {
  title: "How to read a Parkwise opportunity",
  description: COPY.description
};

export default function ReadOpportunityGuidePage() {
  return (
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Getting started</span>
          <h1 className="display-l">How to read a Parkwise opportunity</h1>
          <p className="lead">{COPY.lead}</p>
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {formatDateDdMmYyyy(GUIDE.reviewedAt)}
          </p>
        </div>
      </section>

      <article className="section">
        <div className="container prose-legal guide-article">
          <ul>
            <li>
              <strong>Target return</strong>: the target annual percentage for the selected option,
              before your personal tax. Not a guarantee.
            </li>
            <li>
              <strong>Minimum</strong>: the lowest investment amount for that option.
            </li>
            <li>
              <strong>Target payments</strong>: usually shown as monthly for illustration. Actual
              timing follows the opportunity documents.
            </li>
            <li>
              <strong>Visitors / day and annual revenue</strong>: shown only when published, and
              labelled by source. Modelled figures are not audited accounts.
            </li>
            <li>
              <strong>Included under this investment</strong>: commercial terms for the option. Each
              line has a plain explanation of what it does not mean. Full detail is in the Risk
              Disclosure.
            </li>
            <li>
              <strong>Standard / Premium / EV</strong>: investment options. EV appears only where
              charging is part of the opportunity story.
            </li>
            <li>
              <strong>Express interest</strong>: shows interest only — not a confirmed investment until
              approved.
            </li>
          </ul>
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

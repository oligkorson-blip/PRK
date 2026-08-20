import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
import { articleJsonLd } from "@/lib/guides/article-jsonld";
import { getGuideOrNotFound } from "@/lib/guides/catalog";
import { NO_PLATFORM_FEE_LINE, RISK_LINE } from "@/lib/copy/consumer";
import { formatDateDdMmYyyy } from "@/lib/format";
import { GUIDE_COPY } from "@/lib/guides/copy";

const GUIDE = getGuideOrNotFound("how-fees-affect-returns");
const COPY = GUIDE_COPY["how-fees-affect-returns"];

export const metadata: Metadata = {
  title: "How fees affect returns",
  description: COPY.description
};

export default function FeesAffectReturnsGuidePage() {
  return (
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Fees</span>
          <h1 className="display-l">How fees affect returns</h1>
          <p className="lead">{COPY.lead}</p>
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {formatDateDdMmYyyy(GUIDE.reviewedAt)}
          </p>
        </div>
      </section>
      <article className="section">
        <div className="container prose-legal guide-article">
          <h2>Where fees appear</h2>
          <p>
            {NO_PLATFORM_FEE_LINE} Where an opportunity carries structuring or administration fees,
            they are described in the opportunity documents before you confirm an investment. Where
            a figure is presented net of fees, the page says so.
          </p>
          <h2>What that means for target income</h2>
          <p>
            A target return already reflects the opportunity terms. Higher fees leave less room for
            distributions. Target returns remain targets, not guarantees.
          </p>
          <h2>Before you invest</h2>
          <ul>
            <li>Read the opportunity documents before you confirm</li>
            <li>Compare net figures only when they are labelled as net</li>
            <li>Ask support if a fee is unclear</li>
          </ul>
          <p>
            <Link href="/fees">Fees overview</Link> · <Link href="/apply">Apply to view opportunities</Link>
          </p>
          <p className="field-hint guide-footer">{RISK_LINE}</p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
    </main>
  );
}

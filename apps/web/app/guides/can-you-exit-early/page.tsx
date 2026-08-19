import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
import { articleJsonLd } from "@/lib/guides/article-jsonld";
import { getGuideOrNotFound } from "@/lib/guides/catalog";
import { RISK_LINE } from "@/lib/copy/consumer";
import { formatDateDdMmYyyy } from "@/lib/format";

const GUIDE = getGuideOrNotFound("can-you-exit-early");

export const metadata: Metadata = {
  title: "Can you exit early?",
  description: "How liquidity works for Parkwise parking investments and what early exit usually means."
};

export default function ExitEarlyGuidePage() {
  return (
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Investment terms</span>
          <h1 className="display-l">Can you exit early?</h1>
          <p className="lead">
            Most parking investments are designed to be held for a stated term. Early exit is not
            guaranteed.
          </p>
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {formatDateDdMmYyyy(GUIDE.reviewedAt)}
          </p>
        </div>
      </section>
      <article className="section">
        <div className="container prose-legal guide-article">
          <h2>Plan to hold</h2>
          <p>
            Before you invest, check the term on the opportunity page and documents. Only invest money
            you can leave invested for that period.
          </p>
          <h2>If an early exit is possible</h2>
          <p>
            Any secondary transfer usually depends on finding a buyer. Pricing may be below the
            amount you put in. Opportunity documents explain what, if anything, is available.
          </p>
          <h2>Questions to ask</h2>
          <ul>
            <li>What is the stated term?</li>
            <li>Is there a planned exit mechanism?</li>
            <li>What happens if I need money sooner?</li>
          </ul>
          <p>
            <Link href="/guides/parking-investment-risks">Read risk guide</Link> ·{" "}
            <Link href="/apply">Apply to view opportunities</Link>
          </p>
          <p className="field-hint guide-footer">{RISK_LINE}</p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
    </main>
  );
}

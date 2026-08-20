import Link from "next/link";
import type { Metadata } from "next";
import { GuideDisclaimer } from "@/components/guide-chrome";
import { GUIDE_CATEGORIES, GUIDES } from "@/lib/guides/catalog";
import { GUIDES_INDEX_COPY } from "@/lib/guides/copy";
import { RISK_LINE } from "@/lib/copy/consumer";

export const metadata: Metadata = {
  title: "Guides",
  description: GUIDES_INDEX_COPY.metaDescription
};

export default function GuidesIndexPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">{GUIDES_INDEX_COPY.kicker}</span>
          <h1 className="display-l">{GUIDES_INDEX_COPY.title}</h1>
          <p className="lead">{GUIDES_INDEX_COPY.lead}</p>
          <p className="field-hint stack-3">
            {RISK_LINE} <Link href="/legal/risk">Read the risk disclosure</Link>.
          </p>
          <GuideDisclaimer />
        </div>
      </section>
      <section className="section-tight bg-cream">
        <div className="container">
          <ul className="demand-chips" aria-label="Guide categories">
            {GUIDE_CATEGORIES.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="section">
        <div className="container guides-grid">
          {GUIDES.map((g) => (
            <article key={g.slug} className="guide-card">
              <p className="field-hint">{g.category}</p>
              <h2 className="h3">
                <Link href={`/guides/${g.slug}`}>{g.title}</Link>
              </h2>
              <p>{g.dek}</p>
              <p className="field-hint">{g.minutes} min read</p>
              <Link className="link-arrow" href={`/guides/${g.slug}`}>
                Read the guide →
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

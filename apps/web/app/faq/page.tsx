import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { PageIntro } from "@/components/page-intro";
import { FAQ_INTRO, FAQ_META_DESCRIPTION, FAQ_SECTIONS } from "@/lib/copy/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: FAQ_META_DESCRIPTION
};

function faqAnchor(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function FaqPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_SECTIONS.flatMap((section) =>
      section.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a
        }
      }))
    )
  };

  return (
    <main>
      <JsonLd data={faqLd} />
      <PageIntro
        variant="functional"
        kicker={FAQ_INTRO.kicker}
        title={FAQ_INTRO.title}
        lead={FAQ_INTRO.lead}
      />
      <section className="section">
        <div className="container container-narrow">
          {FAQ_SECTIONS.map((section) => (
            <div key={section.id} className="stack-7">
              <h2 className="h3" id={section.id}>
                {section.title}
              </h2>
              <div className="faq-list">
                {section.items.map((item) => (
                  <details className="faq-item" key={item.q} id={faqAnchor(item.q)}>
                    <summary className="faq-q">{item.q}</summary>
                    <div className="faq-a">
                      <p>{item.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
          <p className="section-foot">
            <Link className="btn btn-primary" href="/apply">
              Apply to view opportunities <span className="arrow">→</span>
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

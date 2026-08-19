import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { PageIntro } from "@/components/page-intro";
import { NO_PLATFORM_FEE_LINE } from "@/lib/copy/consumer";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Clear answers about parking investments, monthly income, risks, fees, and how Parkwise works."
};

const FAQ = [
  {
    q: "What is Parkwise?",
    a: "Parkwise is an investor platform for parking opportunities in selected European cities. You can view opportunities, review terms and risks, and invest through an account after required checks."
  },
  {
    q: "How do investors make money from parking?",
    a: "Drivers pay to park. That revenue supports the asset. Depending on the opportunity terms, available income may be distributed to investors on a target schedule. Income is not guaranteed."
  },
  {
    q: "Is monthly income guaranteed?",
    a: "No. Target monthly income is illustrative. Actual payments may be lower, higher, delayed, or not paid. Capital is at risk."
  },
  {
    q: "What does target return mean?",
    a: "A target return is based on the opportunity terms and expected performance. It is not a promise or a guarantee."
  },
  {
    q: "Who manages the car park?",
    a: "Professional operators manage the site day to day. Parkwise sources, reviews, and structures opportunities, and runs your investor account."
  },
  {
    q: "What is the minimum investment?",
    a: "Minimums vary by opportunity and are shown on each opportunity page."
  },
  {
    q: "Can I exit early?",
    a: "These investments are usually illiquid. Plan to hold for the stated term. Early exit, if possible, typically requires a buyer and may involve a discount."
  },
  {
    q: "What fees will I pay?",
    a: `${NO_PLATFORM_FEE_LINE} Where an opportunity carries its own costs, they are described in its documents before you invest — the Fees page explains how fees affect returns.`
  },
  {
    q: "How do I get started?",
    a: "View opportunities, read the details and risks, then apply for access to complete eligibility and identity checks before investing."
  }
] as const;

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
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a
      }
    }))
  };

  return (
    <main>
      <JsonLd data={faqLd} />
      <PageIntro
        variant="functional"
        kicker="FAQ"
        title="Frequently asked questions"
        lead="Straight answers about how Parkwise works, what you might earn, and what can go wrong."
      />
      <section className="section">
        <div className="container container-narrow">
          <div className="faq-list">
            {FAQ.map((item) => (
              <details className="faq-item" key={item.q} id={faqAnchor(item.q)}>
                <summary className="faq-q">{item.q}</summary>
                <div className="faq-a">
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
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

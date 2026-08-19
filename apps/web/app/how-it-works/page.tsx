import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { JOURNEY_STEPS } from "@/lib/copy/journey-steps";
import { RISK_LINE_SHORT } from "@/lib/copy/consumer";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Explore parking opportunities, apply for access, review and confirm, and track performance from one place."
};

export default async function HowItWorksPage() {
  const user = await getSessionUser();

  return (
    <main>
      <PageIntro
        variant="editorial"
        kicker="How Parkwise works"
        title="From first look to a clearer decision."
        lead="Apply first, then take your time. When an opportunity feels relevant, Parkwise brings the documents, identity checks, team support, and portfolio view into one straightforward path."
      >
        <div className="hero-ctas stack-7">
          <Link className="btn btn-white" href="/apply">
            Request an invitation <span className="arrow">→</span>
          </Link>
          {user ? (
            <Link className="btn btn-ghost-light" href="/opportunities">
              Explore opportunities <span className="arrow">→</span>
            </Link>
          ) : null}
        </div>
      </PageIntro>

      <section className="section">
        <div className="container">
          <div className="steps grid-4">
            {JOURNEY_STEPS.map((step) => (
              <article className="step-card" key={step.n}>
                <span className="step-num">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {user ? (
        <section className="section bg-cream">
          <div className="container container-narrow">
            <div className="section-head center">
              <span className="kicker">Inside your membership</span>
              <h2 className="display-m">Review each opportunity at your own pace</h2>
              <p className="lead">
                Once signed in, you can open the private catalogue and see the figures, documents,
                and terms available for each location.
              </p>
            </div>
            <p className="text-center">
              <Link className="btn btn-primary" href="/opportunities">
                Explore opportunities <span className="arrow">→</span>
              </Link>
            </p>
            <p className="field-hint stack-6 text-center">{RISK_LINE_SHORT}</p>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="container container-narrow">
          <h2 className="h3">After you apply</h2>
          <p className="lead">
            Applying does not commit or invest any money. The team reviews your request and replies
            with clear next steps. You can keep browsing while you wait.
          </p>
          <p>
            <Link className="link-arrow" href="/faq">
              Read the FAQ →
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

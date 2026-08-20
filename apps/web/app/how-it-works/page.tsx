import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import {
  AFTER_YOU_APPLY,
  HOW_IT_WORKS_INTRO,
  JOURNEY_STEPS,
  MEMBERS_SECTION,
  PORTAL_PREVIEW
} from "@/lib/copy/journey-steps";
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
        kicker={HOW_IT_WORKS_INTRO.kicker}
        title={HOW_IT_WORKS_INTRO.title}
        lead={HOW_IT_WORKS_INTRO.lead}
      >
        <div className="hero-ctas stack-7">
          <Link className="btn btn-white" href={HOW_IT_WORKS_INTRO.primaryHref}>
            {HOW_IT_WORKS_INTRO.primaryLabel} <span className="arrow">→</span>
          </Link>
          {user ? (
            <Link className="btn btn-ghost-light" href={HOW_IT_WORKS_INTRO.secondaryHref}>
              {HOW_IT_WORKS_INTRO.secondaryLabel} <span className="arrow">→</span>
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

      <section className="section bg-cream" aria-labelledby="portal-preview-heading">
        <div className="container">
          <div className="section-head">
            <span className="kicker">{PORTAL_PREVIEW.kicker}</span>
            <h2 id="portal-preview-heading" className="display-m">
              {PORTAL_PREVIEW.title}
            </h2>
            <p className="lead">{PORTAL_PREVIEW.lead}</p>
          </div>
          <div className="grid-2">
            {PORTAL_PREVIEW.points.map((point) => (
              <article className="info-card" key={point.title}>
                <h3>{point.title}</h3>
                <p>{point.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {user ? (
        <section className="section">
          <div className="container container-narrow">
            <div className="section-head center">
              <span className="kicker">{MEMBERS_SECTION.kicker}</span>
              <h2 className="display-m">{MEMBERS_SECTION.title}</h2>
              <p className="lead">{MEMBERS_SECTION.lead}</p>
            </div>
            <p className="text-center">
              <Link className="btn btn-primary" href={MEMBERS_SECTION.ctaHref}>
                {MEMBERS_SECTION.ctaLabel} <span className="arrow">→</span>
              </Link>
            </p>
            <p className="field-hint stack-6 text-center">{RISK_LINE_SHORT}</p>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="container container-narrow">
          <h2 className="h3">{AFTER_YOU_APPLY.title}</h2>
          <p className="lead">{AFTER_YOU_APPLY.lead}</p>
          <p>
            <Link className="link-arrow" href={AFTER_YOU_APPLY.linkHref}>
              {AFTER_YOU_APPLY.linkLabel}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

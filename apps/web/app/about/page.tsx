import Link from "next/link";
import type { Metadata } from "next";
import { OperatorPartners } from "@/components/operator-partners";
import { PageIntro } from "@/components/page-intro";
import { NO_PLATFORM_FEE_LINE } from "@/lib/copy/consumer";
import {
  ABOUT_CTA,
  ABOUT_FEES,
  ABOUT_INTRO,
  ABOUT_LOCATION_NOTE,
  ABOUT_META_DESCRIPTION,
  ABOUT_MISSION,
  ABOUT_OPERATORS,
  ABOUT_PROMISES_LIMITS,
  ABOUT_WHAT_WE_DO,
  ABOUT_WHY
} from "@/lib/copy/about";

export const metadata: Metadata = {
  title: "About",
  description: ABOUT_META_DESCRIPTION
};

export default function AboutPage() {
  return (
    <main>
      <PageIntro
        variant="editorial"
        kicker={ABOUT_INTRO.kicker}
        title={ABOUT_INTRO.title}
        lead={ABOUT_INTRO.lead}
      />

      <section className="section">
        <div className="container">
          <div className="split-feature">
            <div className="split-visual">
              <img
                className="brand-photo"
                src="/assets/brand/about-building.jpg"
                alt=""
                width={1672}
                height={941}
                loading="lazy"
              />
            </div>
            <div className="split-copy">
              <span className="kicker">{ABOUT_WHY.kicker}</span>
              <h2 className="display-m">{ABOUT_WHY.title}</h2>
              <p className="lead">{ABOUT_WHY.lead}</p>
              <p className="field-hint stack-4">
                <strong>{ABOUT_MISSION.kicker}:</strong> {ABOUT_MISSION.statement}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-cream">
        <div className="container">
          <div className="section-head center">
            <span className="kicker">{ABOUT_WHAT_WE_DO.kicker}</span>
            <h2 className="display-m">{ABOUT_WHAT_WE_DO.title}</h2>
          </div>
          <ul className="risk-list stack-7">
            {ABOUT_WHAT_WE_DO.points.map((point) => (
              <li key={point.strong}>
                <strong>{point.strong}</strong> — {point.body}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="kicker">{ABOUT_PROMISES_LIMITS.kicker}</span>
            <h2 className="display-m">{ABOUT_PROMISES_LIMITS.title}</h2>
          </div>
          <div className="grid-2">
            <div>
              <h2 className="display-s">{ABOUT_PROMISES_LIMITS.promises.title}</h2>
              <ul className="risk-list">
                {ABOUT_PROMISES_LIMITS.promises.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="display-s">{ABOUT_PROMISES_LIMITS.limits.title}</h2>
              <ul className="risk-list">
                {ABOUT_PROMISES_LIMITS.limits.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-mint">
        <div className="container">
          <div className="section-head">
            <span className="kicker">{ABOUT_OPERATORS.kicker}</span>
            <h2 className="display-m">{ABOUT_OPERATORS.title}</h2>
            <p className="lead">{ABOUT_OPERATORS.lead}</p>
          </div>
          <OperatorPartners />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="kicker">{ABOUT_FEES.kicker}</span>
            <h2 className="display-m">{ABOUT_FEES.title}</h2>
            <p className="lead">
              {NO_PLATFORM_FEE_LINE} {ABOUT_FEES.leadTail}
            </p>
            <Link className="link-arrow" href={ABOUT_FEES.linkHref}>
              {ABOUT_FEES.linkLabel}
            </Link>
          </div>
          <p className="field-hint stack-4">{ABOUT_LOCATION_NOTE}</p>
        </div>
      </section>

      <section className="cta-band section">
        <div className="container">
          <div className="cta-grid">
            <div>
              <h2 className="display-m">{ABOUT_CTA.title}</h2>
              <p className="lead cta-lead">{ABOUT_CTA.lead}</p>
              <div className="apply-actions">
                <Link className="btn btn-white" href={ABOUT_CTA.primaryHref}>
                  {ABOUT_CTA.primaryLabel} <span className="arrow">→</span>
                </Link>
                <Link className="btn btn-ghost-light" href={ABOUT_CTA.secondaryHref}>
                  {ABOUT_CTA.secondaryLabel} <span className="arrow">→</span>
                </Link>
              </div>
            </div>
            <img
              className="brand-photo"
              src="/assets/brand/about-building.jpg"
              alt=""
              width={1672}
              height={941}
              loading="lazy"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

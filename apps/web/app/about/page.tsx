import Link from "next/link";
import type { Metadata } from "next";
import { OperatorPartners } from "@/components/operator-partners";
import { PageIntro } from "@/components/page-intro";
import { NO_PLATFORM_FEE_LINE } from "@/lib/copy/consumer";

export const metadata: Metadata = {
  title: "About",
  description:
    "Real parking assets. Serious diligence. Clear reporting. Learn what Parkwise does and does not do."
};

export default function AboutPage() {
  return (
    <main>
      <PageIntro
        variant="editorial"
        kicker="About"
        title="A clearer way to explore a familiar kind of place."
        lead="Parkwise is built around a simple idea: people should be able to understand a parking investment before they are asked to act."
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
              <span className="kicker">Why we exist</span>
              <h2 className="display-m">Make parking investing feel human</h2>
              <p className="lead">
                Most people already understand the basic model: drivers pay to use a convenient
                space. Parkwise turns that familiar behaviour into opportunity pages you can read,
                compare, and discuss, while professional operators manage each site.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-cream">
        <div className="container">
          <div className="section-head center">
            <span className="kicker">What we do</span>
            <h2 className="display-m">Source. Review. Support.</h2>
          </div>
          <ul className="risk-list stack-7">
            <li>
              <strong>Present strong locations</strong> — parking near familiar, high-demand
              European destinations
              across focus markets.
            </li>
            <li>
              <strong>Review before listing</strong> — terms, risks, and structure before publication.
            </li>
            <li>
              <strong>Support the decision</strong> — documents, updates, and investments in one
              calm account.
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="grid-2">
            <div>
              <h2 className="display-s">What Parkwise does</h2>
              <ul className="risk-list">
                <li>Publishes parking investment opportunities with key terms</li>
                <li>Runs your sign-up and investment confirmation</li>
                <li>Keeps your documents and investments in one place</li>
                <li>Works with professional operators who manage sites day to day</li>
              </ul>
            </div>
            <div>
              <h2 className="display-s">What Parkwise does not do</h2>
              <ul className="risk-list">
                <li>Guarantee returns or monthly income</li>
                <li>Act as a bank holding your cash as a deposit</li>
                <li>Claim to be a regulated fund (UCITS or AIF)</li>
                <li>Remove the need for you to read risks and documents</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-mint">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Operators</span>
            <h2 className="display-m">Professional operators run each site</h2>
            <p className="lead">
              The sites are run day-to-day by experienced parking operators. We look after the
              investor side — presenting each opportunity, guiding you in, and keeping your
              reporting clear.
            </p>
          </div>
          <OperatorPartners />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="kicker">How Parkwise earns</span>
            <h2 className="display-m">Fees, in plain terms</h2>
            <p className="lead">
              {NO_PLATFORM_FEE_LINE} Where an opportunity carries its own structuring or
              administration costs, they are set out in the opportunity documents before you confirm
              — so you know what comes off target returns before you commit.
            </p>
            <Link className="link-arrow" href="/fees">
              View fees →
            </Link>
          </div>
          <p className="field-hint stack-4">
            We&apos;re based in Ireland. Right now we focus on Austria, Belgium, France, Germany,
            Ireland, Italy, Spain, and Switzerland.
          </p>
        </div>
      </section>

      <section className="cta-band section">
        <div className="container">
          <div className="cta-grid">
            <div>
              <h2 className="display-m">See what&apos;s open</h2>
              <p className="lead cta-lead">
                Compare open opportunities, then apply when you&apos;re ready.
              </p>
              <div className="apply-actions">
                <Link className="btn btn-white" href="/apply">
                  Request access <span className="arrow">→</span>
                </Link>
                <Link className="btn btn-ghost-light" href="/sign-in">
                  Sign in <span className="arrow">→</span>
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

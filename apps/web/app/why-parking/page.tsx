import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { WHY_PARKING } from "@/lib/copy/consumer";

export const metadata: Metadata = {
  title: "Why parking",
  description:
    "An everyday need and a potential source of recurring income. Understand parking demand, EV charging, and the risks."
};

export default function WhyParkingPage() {
  return (
    <main>
      <PageIntro
        variant="editorial"
        kicker={WHY_PARKING.intro.kicker}
        title={WHY_PARKING.intro.title}
        lead={WHY_PARKING.intro.lead}
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="kicker">{WHY_PARKING.demand.kicker}</span>
            <h2 className="display-m">{WHY_PARKING.demand.title}</h2>
            <p className="lead">{WHY_PARKING.demand.lead}</p>
          </div>
          <ul className="demand-list stack-7">
            {WHY_PARKING.demand.items.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section bg-cream">
        <div className="container">
          <div className="split-feature">
            <div className="split-visual">
              <img
                className="brand-photo"
                src="/assets/brand/type-airport.jpg"
                alt="An organised European airport parking facility with electric vehicle charging"
                width={1448}
                height={1086}
                loading="lazy"
              />
            </div>
            <div className="split-copy">
              <span className="kicker">{WHY_PARKING.mobility.kicker}</span>
              <h2 className="display-m">{WHY_PARKING.mobility.title}</h2>
              <p className="lead">{WHY_PARKING.mobility.lead}</p>
              <Link className="link-arrow" href="/guides">
                {WHY_PARKING.mobility.linkLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container risk-panel">
          <div className="section-head">
            <span className="kicker">{WHY_PARKING.risk.kicker}</span>
            <h2 className="display-m">{WHY_PARKING.risk.title}</h2>
          </div>
          <ul className="risk-list">
            {WHY_PARKING.risk.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="stack-7">
            <Link className="link-arrow" href={WHY_PARKING.risk.linkHref}>
              {WHY_PARKING.risk.linkLabel}
            </Link>
          </p>
        </div>
      </section>

      <section className="cta-band section">
        <div className="container">
          <div className="cta-grid">
            <div>
              <h2 className="display-m">{WHY_PARKING.cta.title}</h2>
              <p className="lead cta-lead">{WHY_PARKING.cta.lead}</p>
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

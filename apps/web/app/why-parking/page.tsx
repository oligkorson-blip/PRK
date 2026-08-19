import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Why parking",
  description:
    "An everyday need and a potential source of recurring income. Understand parking demand, EV charging, and the risks."
};

const DEMAND = [
  { title: "Commuters", body: "Weekday demand near offices and transport links." },
  { title: "Residents", body: "Overnight and local parking where housing is dense." },
  { title: "Airports", body: "Travel patterns that can support longer stays." },
  { title: "Hospitals", body: "Steady visitor and staff parking needs." },
  { title: "Retail and leisure", body: "Shoppers, diners, and evening visitors." },
  { title: "Events and tourism", body: "Peaks around venues, seasons, and city visitors." },
  { title: "EV charging", body: "Charging can add services where the site supports it." },
  { title: "Limited local supply", body: "Scarce nearby alternatives can support use." }
] as const;

export default function WhyParkingPage() {
  return (
    <main>
      <PageIntro
        variant="editorial"
        kicker="Why parking"
        title="An everyday service in the places people keep moving through."
        lead="Stations, airports, hospitals, shopping districts, and city centres all depend on well-located access. Parking is not glamorous. Its role in daily movement is exactly what makes it worth understanding."
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Demand</span>
            <h2 className="display-m">Who needs parking, day after day</h2>
            <p className="lead">
              Parking demand comes from ordinary, repeatable behaviour — not speculation. Here are the
              groups that keep well-located sites in use.
            </p>
          </div>
          <ul className="demand-list stack-7">
            {DEMAND.map((item) => (
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
              <span className="kicker">Mobility services</span>
              <h2 className="display-m">Parking can also support charging</h2>
              <p className="lead">
                Where a site allows it, EV charging and related services may add revenue alongside
                core parking income. That does not mean every opportunity will earn more, and it does
                not guarantee higher investor returns.
              </p>
              <Link className="link-arrow" href="/guides">
                Read the guides →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container risk-panel">
          <div className="section-head">
            <span className="kicker">Balance the case</span>
            <h2 className="display-m">Not every parking asset performs the same</h2>
          </div>
          <ul className="risk-list">
            <li>Local competition, pricing rules, and access can change how busy sites are.</li>
            <li>Operating costs, maintenance, and vacancies affect available income.</li>
            <li>Policy changes around cars and streets can reshape demand over time.</li>
            <li>Target returns can miss. Capital can be lost.</li>
          </ul>
          <p className="stack-7">
            <Link className="link-arrow" href="/legal/risk">
              Read the full risk disclosure →
            </Link>
          </p>
        </div>
      </section>

      <section className="cta-band section">
        <div className="container">
          <div className="cta-grid">
            <div>
              <h2 className="display-m">See open parking opportunities</h2>
              <p className="lead cta-lead">
                Compare locations and terms before you invest.
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

import Link from "next/link";
import type { Metadata } from "next";
import { AssetCard } from "@/components/asset-card";
import { JsonLd, organizationJsonLd, websiteJsonLd } from "@/components/json-ld";
import { listPublishedAssets } from "@/lib/assets";
import { fundingForAssets } from "@/lib/assets/funding";
import { isCommunitySpacesEnabled } from "@/lib/platform-settings/queries";
import { getSessionUser } from "@/lib/auth/session";
import { ACCESS_STEPS } from "@/lib/copy/access-steps";
import {
  CAMPAIGN_HEADLINE,
  CAMPAIGN_KICKER,
  CAMPAIGN_SUPPORT,
  HOME_ABOUT,
  HOME_FAQ,
  HOME_QUIET,
  HOME_RISK,
  HOME_TRUST_FACTS,
  REQUEST_ACCESS_LABEL,
  RISK_LINE,
  STATUS_BAR_HOME
} from "@/lib/copy/consumer";
import "./home.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Root-segment gotcha: layout title.template only applies to child segments,
  // so a plain string here would render without the brand. Use absolute.
  title: { absolute: "Parkwise | Invest in parking assets" },
  description: `${CAMPAIGN_HEADLINE} ${CAMPAIGN_SUPPORT}`
};

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export default async function HomePage() {
  const [user, communitySpacesEnabled] = await Promise.all([
    getSessionUser(),
    isCommunitySpacesEnabled()
  ]);
  const rows = user ? await listPublishedAssets() : [];
  const fundingMap = await fundingForAssets(
    rows.map((a) => ({ id: a.id, advisoryCapacityEur: a.advisoryCapacityEur }))
  );
  const featured = rows.slice(0, 3).map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    tier: a.tier,
    city: a.city,
    country: a.country,
    operator: a.operator,
    operatorDisplay: a.operatorDisplay,
    spaces: a.spaces,
    targetYieldPct: a.targetYieldPct,
    minTicketEur: a.minTicketEur,
    incomeMix: a.incomeMix,
    investmentOptions: a.investmentOptions,
    commercialTermIds: a.commercialTermIds,
    leaseLabel: a.leaseLabel,
    assetStatus: a.status,
    siteType: a.siteType,
    artVariant: a.artVariant,
    coverImageUrl: a.coverImageUrl,
    funding: fundingMap.get(a.id) ?? null
  }));

  return (
    <main className="home-page">
      <JsonLd data={[organizationJsonLd(siteOrigin()), websiteJsonLd(siteOrigin())]} />

      <section className="home-hero" aria-labelledby="home-hero-heading">
        <img
          className="home-hero-bg"
          src="/assets/brand/hero-main.jpg"
          alt="A modern European parking structure beside a railway station"
          width={1672}
          height={941}
        />
        <div className="home-hero-scrim" aria-hidden="true" />
        <div className="home-hero-copy hero-reveal">
          <p className="hero-brand">Parkwise</p>
          <span className="kicker home-hero-kicker">{CAMPAIGN_KICKER}</span>
          <h1 id="home-hero-heading" className="display-xl home-hero-title">
            {CAMPAIGN_HEADLINE}
          </h1>
          <p className="home-hero-support">{CAMPAIGN_SUPPORT}</p>
          <div className="hero-ctas home-hero-ctas">
            <Link className="btn btn-lime home-hero-cta-primary" href={user ? "/opportunities" : "/sign-in"}>
              {user ? "Browse opportunities" : "Sign in to explore"} <span className="arrow">→</span>
            </Link>
            <Link className="link-arrow home-hero-secondary" href="/how-it-works">
              See how it works
            </Link>
          </div>
          <p className="field-hint home-hero-cta-hint">Private access for registered members.</p>
          {user ? (
            <p className="home-hero-choose">
              <Link className="home-hero-text-link" href="/help-me-choose">
                Help me choose
              </Link>
            </p>
          ) : null}
          <p className="risk-line home-hero-risk">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3l7 3v5c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-3z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            {RISK_LINE}
          </p>
        </div>
      </section>

      <section className="home-trust" aria-label="What you can rely on">
        <div className="container">
          <ul className="home-trust-list">
            {HOME_TRUST_FACTS.map((fact) => (
              <li key={fact.label}>
                <strong>{fact.label}</strong>
                <span>{fact.detail}</span>
              </li>
            ))}
          </ul>
          <p className="sr-only">{STATUS_BAR_HOME}</p>
        </div>
      </section>

      <section className="home-section home-about section-enter" aria-labelledby="about-platform-heading">
        <div className="container">
          <div className="home-section-head">
            <div>
              <span className="kicker">{HOME_ABOUT.kicker}</span>
              <h2 id="about-platform-heading" className="home-section-title">
                {HOME_ABOUT.title}
              </h2>
              <p className="lead home-section-lead">{HOME_ABOUT.lead}</p>
            </div>
          </div>
          <div className="grid-3 home-about-grid">
            {HOME_ABOUT.points.map((point) => (
              <article className="info-card" key={point.title}>
                <h3>{point.title}</h3>
                <p>{point.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="home-section home-path-section section-enter"
        aria-labelledby="how-access-heading"
      >
        <div className="container">
          <div className="home-section-head">
            <div>
              <span className="kicker">A clear path</span>
              <h2 id="how-access-heading" className="home-section-title">
                Explore first. Decide later.
              </h2>
              <p className="lead home-section-lead">
                Start with places and numbers. Request an invitation when you want documents and a
                conversation with the team.
              </p>
            </div>
          </div>
          <ol className="home-path">
            {ACCESS_STEPS.map((step) => (
              <li className="home-path-step" key={step.n}>
                <span className="home-path-num" aria-hidden="true">
                  {step.n}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <p className="home-path-meta">{step.meta}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="home-path-foot">
            <Link className="link-arrow" href="/how-it-works">
              Read the full process →
            </Link>
          </p>
        </div>
      </section>

      {user && communitySpacesEnabled ? (
        <section className="home-section home-lanes section-enter" aria-labelledby="choose-route-heading">
          <div className="container">
            <div className="home-section-head">
              <div>
                <span className="kicker">Choose your route</span>
                <h2 id="choose-route-heading" className="home-section-title">
                  Start with the way parking fits your life.
                </h2>
                <p className="lead home-section-lead">
                  Explore a location-pool investment, or find a privately supplied space for everyday parking.
                </p>
              </div>
            </div>
            <div className="grid-2">
              <article className="info-card">
                <span className="kicker">For investors</span>
                <h3>Invest in a parking location</h3>
                <p>
                  Compare published opportunities by place, minimum investment, target return, and terms.
                </p>
                <Link className="link-arrow" href="/opportunities">
                  Browse opportunities →
                </Link>
              </article>
              <article className="info-card">
                <span className="kicker">For everyday parking</span>
                <h3>Find a space near where you need to be</h3>
                <p>
                  Browse manually verified residential spaces, EV bays, garages, and private lots.
                </p>
                <Link className="link-arrow" href="/spaces">
                  Find parking →
                </Link>
              </article>
            </div>
          </div>
        </section>
      ) : null}

      <section className="home-section home-why section-enter" aria-labelledby="why-parking-heading">
        <div className="container home-why-grid">
          <div className="home-why-copy">
            <span className="kicker">Why parking</span>
            <h2 id="why-parking-heading" className="home-section-title">
              Built around everyday movement.
            </h2>
            <p className="lead home-why-lead">
              Parking sits beside journeys people already make — commuting, travelling, shopping,
              working, and visiting. Some well-located places can also support EV charging.
            </p>
            <div className="apply-actions stack-4">
              <Link className="link-arrow" href="/why-parking">
                Read more on why parking →
              </Link>
              <Link className="link-arrow" href="/guides">
                Explore guides →
              </Link>
            </div>
          </div>
          <figure className="home-why-art">
            <img
              className="brand-photo"
              src="/assets/brand/type-city.jpg"
              alt="A city-centre underground parking entrance in a busy European district"
              width={1448}
              height={1086}
              loading="lazy"
            />
          </figure>
        </div>
      </section>

      <section className="home-section home-quiet section-enter" aria-label="A quiet note">
        <div className="container home-quiet-inner">
          {HOME_QUIET.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>

      {user && featured.length > 0 ? (
        <section className="home-section home-opps section-enter" aria-labelledby="live-opps-heading">
          <div className="container">
            <div className="home-section-head">
              <div>
                <span className="kicker">Across Europe</span>
                <h2 id="live-opps-heading" className="home-section-title">
                  Start with a place you know.
                </h2>
                <p className="lead home-section-lead">
                  Browse stations, airports, and city centres by location, operator, minimum
                  investment, and target return.
                </p>
              </div>
              <Link className="link-arrow home-section-link" href="/opportunities">
                View all →
              </Link>
            </div>
            <div className="assets-grid assets-grid-enter home-featured-grid">
              {featured.map((asset) => (
                <AssetCard key={asset.id} asset={asset} variant="homepage" />
              ))}
            </div>
          </div>
        </section>
      ) : user ? (
        <section className="home-section home-opps section-enter" aria-labelledby="live-opps-heading">
          <div className="container">
            <div className="empty-state">
              <h2 id="live-opps-heading" className="display-s">
                New opportunities are on the way
              </h2>
              <p className="stack-4">
                <Link className="link-arrow" href="/how-it-works">
                  Read the full process →
                </Link>
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="home-section home-risk section-enter" aria-labelledby="home-risk-heading">
        <div className="container container-narrow">
          <div className="home-section-head">
            <div>
              <span className="kicker">{HOME_RISK.kicker}</span>
              <h2 id="home-risk-heading" className="home-section-title">
                {HOME_RISK.title}
              </h2>
              <p className="lead home-section-lead">{HOME_RISK.lead}</p>
            </div>
          </div>
          <ul className="home-risk-points">
            {HOME_RISK.points.map((point) => (
              <li key={point.title}>
                <h3>{point.title}</h3>
                <p>{point.body}</p>
              </li>
            ))}
          </ul>
          <p className="stack-5">
            <Link className="link-arrow" href={HOME_RISK.linkHref}>
              {HOME_RISK.linkLabel}
            </Link>
          </p>
        </div>
      </section>

      <section className="home-section home-faq section-enter" aria-labelledby="home-faq-heading" id="home-faq">
        <div className="container container-narrow">
          <div className="home-section-head">
            <div>
              <span className="kicker">Questions</span>
              <h2 id="home-faq-heading" className="home-section-title">
                Common questions.
              </h2>
            </div>
          </div>
          <div className="faq-list">
            {HOME_FAQ.map((item, index) => (
              <details className="faq-item" key={item.q} open={index < 2 ? true : undefined}>
                <summary className="faq-q">{item.q}</summary>
                <div className="faq-a">
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta section-enter" aria-labelledby="home-cta-heading">
        <div className="container home-cta-grid">
          <div>
            <h2 id="home-cta-heading" className="home-cta-title">Ready to look a little closer?</h2>
            <p className="lead cta-lead home-cta-lead">
              Browse at your own pace. Request an invitation when you want the documents and a
              conversation with the team.
            </p>
            <div className="apply-actions home-cta-actions">
              {user ? (
                <Link className="btn btn-white" href="/opportunities">
                  Browse opportunities <span className="arrow">→</span>
                </Link>
              ) : (
                <Link className="btn btn-white" href="/sign-in">
                  Sign in to browse <span className="arrow">→</span>
                </Link>
              )}
              <Link className="btn btn-ghost-light" href="/apply">
                {REQUEST_ACCESS_LABEL} <span className="arrow">→</span>
              </Link>
            </div>
            <p className="risk-line home-cta-risk">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3l7 3v5c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-3z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              {RISK_LINE}
            </p>
          </div>
          <div className="home-cta-art" aria-hidden="true">
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

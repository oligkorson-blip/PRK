import Link from "next/link";
import type { Metadata } from "next";
import { Cite } from "@/components/cite";
import { JsonLd } from "@/components/json-ld";
import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
import { articleJsonLd } from "@/lib/guides/article-jsonld";
import { getGuideOrNotFound } from "@/lib/guides/catalog";
import { formatDateDdMmYyyy } from "@/lib/format";

const GUIDE = getGuideOrNotFound("european-parking-and-mobility-2026");

export const metadata: Metadata = {
  title: "European parking and mobility in 2026",
  description:
    "Public figures on European cars, charging, and AFIR — and how Parkwise parking opportunities fit. Capital at risk."
};

export default function FlagshipGuidePage() {
  return (
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Parking and mobility</span>
          <h1 className="display-l">European parking and mobility in 2026</h1>
          <p className="lead">
            Cars still fill European cities. Charging infrastructure is expanding under hard EU rules.
            Destination parking sits where those two facts meet.
          </p>
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {formatDateDdMmYyyy(GUIDE.reviewedAt)}
          </p>
        </div>
      </section>

      <article className="section">
        <div className="container prose-legal guide-article">
          <h2 className="h3">Fleet reality</h2>
          <p>
            The EU passenger car stock exceeded 260 million by end-2024
            <Cite
              source="Eurostat — Passenger cars in the EU"
              url="https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Passenger_cars_in_the_EU"
              asOf="End 2024"
            />
            . Motorisation was about 0.55 passenger cars per inhabitant in 2023
            <Cite
              source="Eurostat news"
              url="https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20250521-1"
              asOf="2023"
            />
            . Battery-only electric passenger cars reached almost 5.8 million in the EU by end-2024
            (+30% year on year)
            <Cite
              source="Eurostat — Passenger cars in the EU"
              url="https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Passenger_cars_in_the_EU"
              asOf="End 2024"
            />
            .
          </p>

          <h2 className="h3">Charging build-out</h2>
          <p>
            Publicly accessible recharging points reached 1,155,861 in May 2026 (+19.1% vs May 2025)
            <Cite
              source="EAFO News Flash — June 2026"
              url="https://alternative-fuels-observatory.ec.europa.eu/general-information/news/eafo-news-flash-june-2026"
              asOf="May 2026"
            />
            . Preliminary May 2026 figures for reporting Member States show strong BEV registration
            growth alongside that network expansion.
          </p>

          <h2 className="h3">Policy floor (AFIR)</h2>
          <p>
            Regulation (EU) 2023/1804 (AFIR) has applied since 13 April 2024
            <Cite
              source="European Commission — Alternative fuels infrastructure"
              url="https://transport.ec.europa.eu/transport-themes/clean-transport/alternative-fuels-sustainable-mobility-europe/alternative-fuels-infrastructure_en"
              asOf="Law"
            />
            . It sets fleet-based public power targets (including ≥1.3 kW per BEV) and distance-based
            TEN-T fast-charging coverage toward 2030. That is a deployment obligation on Member
            States — not a return promise for any private investment.
          </p>

          <h2 className="h3">What that means for parking assets</h2>
          <p>
            City parking already earns from scarce urban space. Where EV bays and add-ons sit
            alongside it, they can add income — parking stays the main stream on Parkwise listings.
            Macro facts do not set Parkwise target returns.
          </p>

          <h2 className="h3">How Parkwise fits</h2>
          <p>
            Apply for access, finish setting up your account, then express interest in an option
            that fits. We confirm investments after identity checks and review.{" "}
            <Link href="/sign-in">Sign in to view opportunities</Link> ·{" "}
            <Link href="/apply">Apply for access</Link> · <Link href="/legal/risk">Risk disclosure</Link>.
          </p>

          <p className="field-hint guide-footer">
            Figures are public statistics or cited research, not forecasts of Parkwise returns.
            Capital at risk. See Risk disclosure.
          </p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
    </main>
  );
}

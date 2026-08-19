import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { OpportunitiesCatalogue } from "@/app/opportunities/opportunities-catalogue";
import { PageIntro } from "@/components/page-intro";
import { listPublishedAssets } from "@/lib/assets";
import type { InvestmentOption } from "@/lib/assets/investment-options";
import { formatEur, formatYieldPct } from "@/lib/format";
import { fundingForAssets } from "@/lib/assets/funding";
import { requireSessionUserOrRedirect } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Opportunities",
  description:
    "Browse parking opportunities across high-demand European locations. Capital at risk."
};

function optionRanges(assets: { investmentOptions: unknown }[]) {
  const byId: Record<"standard" | "premium" | "green", { tickets: number[]; yields: number[] }> = {
    standard: { tickets: [], yields: [] },
    premium: { tickets: [], yields: [] },
    green: { tickets: [], yields: [] }
  };

  for (const asset of assets) {
    const opts = asset.investmentOptions;
    if (!Array.isArray(opts)) continue;
    for (const raw of opts) {
      const o = raw as Partial<InvestmentOption>;
      if (o.id !== "standard" && o.id !== "premium" && o.id !== "green") continue;
      if (typeof o.minTicketEur === "number") byId[o.id].tickets.push(o.minTicketEur);
      if (typeof o.yieldPct === "number") byId[o.id].yields.push(o.yieldPct);
    }
  }

  function band(values: number[], format: (n: number) => string): string | null {
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? format(min) : `${format(min)}–${format(max)}`;
  }

  return {
    standard: {
      ticket: band(byId.standard.tickets, formatEur),
      yield: band(byId.standard.yields, formatYieldPct)
    },
    premium: {
      ticket: band(byId.premium.tickets, formatEur),
      yield: band(byId.premium.yields, formatYieldPct)
    },
    ev: {
      ticket: band(byId.green.tickets, formatEur),
      yield: band(byId.green.yields, formatYieldPct)
    }
  };
}

export default async function OpportunitiesPage() {
  await requireSessionUserOrRedirect();
  const rows = await listPublishedAssets();
  const fundingMap = await fundingForAssets(
    rows.map((a) => ({ id: a.id, advisoryCapacityEur: a.advisoryCapacityEur }))
  );
  const assets = rows.map((a) => ({
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
    blurb: a.blurb,
    funding: fundingMap.get(a.id) ?? null,
    visitorsPerDay: a.visitorsPerDay,
    visitorsProvenance: a.visitorsProvenance,
    availableSpaces: a.availableSpaces,
    annualRevenueEur: a.annualRevenueEur,
    revenueProvenance: a.revenueProvenance,
    occupancyPct: a.occupancyPct
  }));
  const ranges = optionRanges(assets);

  return (
    <main>
      <PageIntro
        variant="functional"
        kicker="European opportunities"
        title="Find a parking opportunity that fits your plans."
        lead="Browse places, operators, minimums, and target returns. Your private catalogue is available whenever you are ready to look closer."
      >
        <div className="catalogue-intro-notes">
          <p className="field-hint">
            Austria · Belgium · France · Germany · Ireland · Italy · Spain · Switzerland
          </p>
          <p>
            <Link className="link-arrow" href="/help-me-choose">
              Help me choose
            </Link>
          </p>
        </div>
      </PageIntro>

      <section className="section">
        <div className="container">
          {assets.length === 0 ? (
            <div className="empty-state">
              <h2 className="h3">No opportunities open right now</h2>
              <p className="lead">
                Request access to be notified when new listings become available.
              </p>
              <Link className="btn btn-primary" href="/apply">
                Request access
              </Link>
            </div>
          ) : (
            <Suspense fallback={<p className="field-hint">Loading catalogue…</p>}>
              <OpportunitiesCatalogue assets={assets} />
            </Suspense>
          )}
        </div>
      </section>

      {assets.length > 0 ? (
        <section className="section bg-cream">
          <div className="container">
            <details className="sim-assumptions tier-primer">
              <summary>Investment options — Standard, Premium, and EV</summary>
              <p className="lead stack-3">
                Options differ by minimum investment and target return. Open an opportunity to see
                the numbers, what is included, and the terms.
              </p>
              <div className="grid-3 tier-grid stack-6">
                <article className="tier-card">
                  <h3>Standard</h3>
                  <p>Core parking income with the lowest minimum investment.</p>
                  {ranges.standard.ticket || ranges.standard.yield ? (
                    <p className="field-hint">
                      {ranges.standard.ticket ? <>From {ranges.standard.ticket}</> : null}
                      {ranges.standard.ticket && ranges.standard.yield ? " · " : null}
                      {ranges.standard.yield ? <>Target {ranges.standard.yield}</> : null}
                    </p>
                  ) : null}
                </article>
                <article className="tier-card featured">
                  <h3>Premium</h3>
                  <p>Higher target return where the lease structure supports it. Not guaranteed.</p>
                  {ranges.premium.ticket || ranges.premium.yield ? (
                    <p className="field-hint">
                      {ranges.premium.ticket ? <>From {ranges.premium.ticket}</> : null}
                      {ranges.premium.ticket && ranges.premium.yield ? " · " : null}
                      {ranges.premium.yield ? <>Target {ranges.premium.yield}</> : null}
                    </p>
                  ) : null}
                </article>
                <article className="tier-card">
                  <h3>EV</h3>
                  <p>Parking plus EV-related income streams where the site supports charging.</p>
                  {ranges.ev.ticket || ranges.ev.yield ? (
                    <p className="field-hint">
                      {ranges.ev.ticket ? <>From {ranges.ev.ticket}</> : null}
                      {ranges.ev.ticket && ranges.ev.yield ? " · " : null}
                      {ranges.ev.yield ? <>Target {ranges.ev.yield}</> : null}
                    </p>
                  ) : null}
                </article>
              </div>
            </details>
          </div>
        </section>
      ) : null}
    </main>
  );
}

import type { Metadata } from "next";
import { HelpMeChooseWizard } from "@/components/help-me-choose-wizard";
import { listPublishedAssets } from "@/lib/assets";
import { fundingForAssets } from "@/lib/assets/funding";
import type { OpportunityListFields } from "@/lib/assets/list-fields";
import { requireSessionUserOrRedirect } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Help me choose",
  description:
    "Answer a few simple questions and see a shortlist of parking opportunities to explore. Illustrative — not personal advice."
};

export default async function HelpMeChoosePage() {
  await requireSessionUserOrRedirect();
  const rows = await listPublishedAssets();
  const fundingMap = await fundingForAssets(
    rows.map((a) => ({ id: a.id, advisoryCapacityEur: a.advisoryCapacityEur }))
  );

  const assets: OpportunityListFields[] = rows.map((a) => ({
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

  return (
    <main className="help-choose-page">
      <section className="help-choose-shell">
        <div className="container help-choose-container">
          <HelpMeChooseWizard assets={assets} />
        </div>
      </section>
    </main>
  );
}

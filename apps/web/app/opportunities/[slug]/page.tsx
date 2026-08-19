import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { assetLocationLabel, getPublishedAssetBySlug } from "@/lib/assets";
import { getExistingInvestor } from "@/lib/auth/investor";
import { canExpressInterest, isOnboardingComplete } from "@/lib/auth/gates";
import { getSessionUser, requireSessionUserOrRedirect } from "@/lib/auth/session";
import { IncomeMixPanel } from "@/components/income-mix-panel";
import { OpportunityDetailClient } from "@/components/opportunity-detail-client";
import { publicOperatorLabel } from "@/lib/assets/operator-display";
import { siteTypeDisplay } from "@/lib/assets/presentation";
import type { InvestmentOption } from "@/lib/assets/investment-options";
import type { CommercialTermId } from "@/lib/assets/commercial-terms";
import type { MetricProvenance } from "@/lib/assets/metric-provenance";
import { RISK_LINE } from "@/lib/copy/consumer";
import { fundingForAssets } from "@/lib/assets/funding";
import { isPoolInvestmentsEnabled } from "@/lib/platform-settings/queries";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const asset = await getPublishedAssetBySlug(slug);
  if (!asset) return { title: "Opportunity" };
  return {
    title: asset.name,
    description: `${asset.name} in ${asset.city}. Parking investment opportunity. ${RISK_LINE}`
  };
}

export default async function OpportunityDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ option?: string }>;
}) {
  await requireSessionUserOrRedirect();
  const { slug } = await params;
  const { option: initialOptionId } = await searchParams;
  const asset = await getPublishedAssetBySlug(slug);

  if (!asset) {
    notFound();
  }

  const sessionUser = await getSessionUser();
  const signedIn = Boolean(sessionUser);
  // Read-only: browsing the catalogue must not create an investor row,
  // audit event, or lead reassignment.
  const investor = sessionUser ? await getExistingInvestor(sessionUser.id) : null;
  const options = (asset.investmentOptions ?? []) as InvestmentOption[];
  const operatorLabel = publicOperatorLabel(asset.operatorDisplay, asset.operator);
  const [fundingMap, poolInvestmentsEnabled] = await Promise.all([
    fundingForAssets([
    { id: asset.id, advisoryCapacityEur: asset.advisoryCapacityEur }
    ]),
    isPoolInvestmentsEnabled()
  ]);
  const funding = fundingMap.get(asset.id) ?? null;

  return (
    <main>
      <OpportunityDetailClient
        assetSlug={asset.slug}
        operatorLabel={operatorLabel}
        name={asset.name}
        location={assetLocationLabel(asset)}
        city={asset.city}
        country={asset.country}
        blurb={asset.blurb}
        leaseLabel={asset.leaseLabel}
        assetStatus={asset.status}
        spaces={asset.spaces}
        siteType={siteTypeDisplay(asset.siteType)}
        artVariant={asset.artVariant}
        coverImageUrl={asset.coverImageUrl}
        galleryImageUrls={asset.galleryImageUrls ?? []}
        coverImageCaption={asset.coverImageCaption}
        funding={funding}
        options={options}
        targetYieldPct={asset.targetYieldPct}
        minTicketEur={asset.minTicketEur}
        assetTermIds={(asset.commercialTermIds ?? []) as CommercialTermId[]}
        visitorsPerDay={asset.visitorsPerDay}
        visitorsProvenance={(asset.visitorsProvenance ?? "withheld") as MetricProvenance}
        availableSpaces={asset.availableSpaces}
        annualRevenueEur={asset.annualRevenueEur}
        revenueProvenance={(asset.revenueProvenance ?? "withheld") as MetricProvenance}
        occupancyPct={asset.occupancyPct}
        placeStory={asset.placeStory}
        operatorStory={asset.operatorStory}
        demandStory={asset.demandStory}
        numbersNote={asset.numbersNote}
        signedIn={signedIn}
        needsOnboarding={Boolean(signedIn && (!investor || !isOnboardingComplete(investor)))}
        canInterest={Boolean(investor && canExpressInterest(investor))}
        poolInvestmentsEnabled={poolInvestmentsEnabled}
        poolAccessEnabled={Boolean(investor?.poolInvestmentsEnabled)}
        initialOptionId={initialOptionId ?? null}
      >
        <IncomeMixPanel mix={asset.incomeMix} />
      </OpportunityDetailClient>
    </main>
  );
}

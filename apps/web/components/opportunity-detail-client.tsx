"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatEur, formatYieldPct } from "@/lib/format";
import { type CommercialTermId } from "@/lib/assets/commercial-terms";
import { findOption, type InvestmentOption } from "@/lib/assets/investment-options";
import { type MetricProvenance } from "@/lib/assets/metric-provenance";
import {
  resolveDetailCta,
  resolveMobileDetailCta,
  type CtaUserState
} from "@/lib/copy/cta";
import { BUYBACK_ENABLED } from "@/lib/copy/posture";
import type { FundingSnapshot } from "@/lib/assets/funding";
import { buildOpportunityPresentation } from "@/lib/assets/presentation";
import { OpportunityDetailHero } from "@/components/opportunity-detail-hero";
import { OpportunityDetailOverview } from "@/components/opportunity-detail-overview";
import { OpportunityDetailLocation } from "@/components/opportunity-detail-location";
import { OpportunityDetailOperator } from "@/components/opportunity-detail-operator";
import { OpportunityDetailReturns } from "@/components/opportunity-detail-returns";
import { OpportunityDetailFees } from "@/components/opportunity-detail-fees";
import { OpportunityDetailRisks } from "@/components/opportunity-detail-risks";
import { OpportunityDetailDocuments } from "@/components/opportunity-detail-documents";
import { OpportunityDetailFaq } from "@/components/opportunity-detail-faq";
import { DecisionSummary } from "@/components/opportunity-detail-summary";

export type OpportunityDetailClientProps = {
  assetSlug: string;
  operatorLabel: string;
  name: string;
  location: string;
  city: string;
  country: string;
  blurb: string;
  leaseLabel: string;
  assetStatus?: string;
  spaces: number;
  siteType?: string | null;
  artVariant?: number | null;
  coverImageUrl?: string | null;
  galleryImageUrls?: string[];
  coverImageCaption?: string | null;
  funding?: FundingSnapshot | null;
  options: InvestmentOption[];
  /** Asset-level fallbacks when options is empty (catalogue-card parity). */
  targetYieldPct?: string | number | null;
  minTicketEur?: string | number | null;
  assetTermIds: CommercialTermId[];
  visitorsPerDay: number | null;
  visitorsProvenance: MetricProvenance;
  availableSpaces: number | null;
  annualRevenueEur: number | null;
  revenueProvenance: MetricProvenance;
  occupancyPct?: string | number | null;
  placeStory?: string | null;
  operatorStory?: string | null;
  demandStory?: string | null;
  numbersNote?: string | null;
  signedIn: boolean;
  needsOnboarding: boolean;
  canInterest: boolean;
  /** Global super-admin switch for the location-pool investment lane. */
  poolInvestmentsEnabled: boolean;
  /** Per-investor access flag; users cannot change this themselves. */
  poolAccessEnabled: boolean;
  initialOptionId?: string | null;
  children?: ReactNode;
};

const DETAIL_NAV = [
  { id: "overview", label: "Overview" },
  { id: "location", label: "Place" },
  { id: "returns", label: "Options" },
  { id: "terms", label: "Terms" },
  { id: "risks", label: "Risks" },
  { id: "documents", label: "Documents" }
] as const;

export function OpportunityDetailClient(props: OpportunityDetailClientProps) {
  const [optionId, setOptionId] = useState(
    () => findOption(props.options, props.initialOptionId)?.id ?? "standard"
  );
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [termsSeen, setTermsSeen] = useState(false);
  const selected = useMemo(
    () => findOption(props.options, optionId) ?? props.options[0],
    [optionId, props.options]
  );

  const presentation = useMemo(
    () =>
      buildOpportunityPresentation({
        name: props.name,
        slug: props.assetSlug,
        city: props.city,
        country: props.country,
        siteType: props.siteType,
        operator: props.operatorLabel,
        operatorDisplay: { mode: "named", label: props.operatorLabel },
        spaces: props.spaces,
        leaseLabel: props.leaseLabel,
        assetStatus: props.assetStatus ?? "published",
        targetYieldPct: selected?.yieldPct ?? props.targetYieldPct ?? null,
        minTicketEur: selected?.minTicketEur ?? props.minTicketEur ?? null,
        investmentOptions: props.options,
        commercialTermIds: props.assetTermIds,
        funding: props.funding
      }),
    [props, selected?.yieldPct, selected?.minTicketEur]
  );

  const termIds = (
    selected?.commercialTermIds?.length > 0 ? selected.commercialTermIds : props.assetTermIds
  ).filter((id) => BUYBACK_ENABLED || id !== "buyback_at_par");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("option") === optionId) return;
    url.searchParams.set("option", optionId);
    window.history.replaceState({}, "", url.toString());
  }, [optionId]);

  useEffect(() => {
    const ids = DETAIL_NAV.map((item) => item.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: "-30% 0px -55% 0px",
        threshold: [0.1, 0.25, 0.5]
      }
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const terms = document.getElementById("terms");
    const risks = document.getElementById("risks");
    const targets = [terms, risks].filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setTermsSeen(true);
        }
      },
      { rootMargin: "0px 0px -20% 0px", threshold: 0.2 }
    );

    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const funding = presentation.funding;
  const ctaUser: CtaUserState = !props.signedIn
    ? "signed_out"
    : props.needsOnboarding
      ? "needs_onboarding"
      : props.canInterest
        ? "can_interest"
        : "account_inactive";
  const cta = resolveDetailCta({
    statusId: presentation.status.id,
    allowsInvestmentCta: presentation.allowsInvestmentCta,
    user: ctaUser,
    poolEnabled: props.poolInvestmentsEnabled,
    poolAccessEnabled: props.poolAccessEnabled,
    assetSlug: props.assetSlug,
    optionId: selected?.id ?? optionId
  });
  const mobileCta = resolveMobileDetailCta({ cta, termsSeen });

  /** Detail hero/key-terms follow the selected option; catalogue keeps the yield ceiling. */
  const selectedPresentation = useMemo(() => {
    if (!selected) return presentation;
    return {
      ...presentation,
      yieldDisplay: formatYieldPct(selected.yieldPct),
      minTicketEur: selected.minTicketEur,
      minTicketDisplay: formatEur(selected.minTicketEur)
    };
  }, [presentation, selected]);

  const summaryPanel = selected ? (
    <DecisionSummary
      presentation={presentation}
      selected={selected}
      funding={funding}
      cta={cta}
      assetSlug={props.assetSlug}
      showFunding={presentation.showFunding}
      termsSeen={termsSeen}
    />
  ) : null;

  return (
    <>
      <OpportunityDetailHero
        presentation={selectedPresentation}
        name={props.name}
        location={props.location}
        siteType={props.siteType}
        coverImageUrl={props.coverImageUrl}
        assetSlug={props.assetSlug}
      />

      <nav className="detail-jump" aria-label="On this page">
        <div className="container detail-jump-inner">
          {DETAIL_NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={activeSection === item.id ? "is-active" : undefined}
              aria-current={activeSection === item.id ? "true" : undefined}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <section className="section opp-detail-section">
        <div className="container detail-layout">
          <div className="detail-main">
            <OpportunityDetailOverview
              artVariant={props.artVariant}
              name={props.name}
              city={props.city}
              coverImageUrl={props.coverImageUrl}
              galleryImageUrls={props.galleryImageUrls}
              siteType={props.siteType}
              coverImageCaption={props.coverImageCaption}
              blurb={props.blurb}
              spaces={props.spaces}
              operatorLabel={props.operatorLabel}
              termDisplay={presentation.termDisplay}
            />

            <OpportunityDetailLocation
              city={props.city}
              country={props.country}
              siteType={props.siteType}
              visitorsPerDay={props.visitorsPerDay}
              visitorsProvenance={props.visitorsProvenance}
              availableSpaces={props.availableSpaces}
              spaces={props.spaces}
              annualRevenueEur={props.annualRevenueEur}
              revenueProvenance={props.revenueProvenance}
              placeStory={props.placeStory}
              demandStory={props.demandStory}
              numbersNote={props.numbersNote}
            />

            <OpportunityDetailOperator
              operatorLabel={props.operatorLabel}
              operatorStory={props.operatorStory}
            />

            <OpportunityDetailReturns
              options={props.options}
              selected={selected}
              onSelectOption={setOptionId}
              paymentFrequencyDisplay={presentation.paymentFrequencyDisplay}
              termDisplay={presentation.termDisplay}
            >
              {props.children}
            </OpportunityDetailReturns>

            <OpportunityDetailFees
              termIds={termIds}
              termDisplay={presentation.termDisplay}
              paymentFrequencyDisplay={presentation.paymentFrequencyDisplay}
            />

            <OpportunityDetailRisks />

            <OpportunityDetailDocuments />

            <OpportunityDetailFaq />
          </div>

          <aside className="detail-side" id="mobile-interest">{summaryPanel}</aside>
        </div>
      </section>

      {selected && presentation.allowsInvestmentCta && mobileCta ? (
        <div className="mobile-allocation-bar">
          <div>
            <strong>{selected.id === "green" ? "EV option" : selected.label}</strong>
            <span className="field-hint">
              {formatYieldPct(selected.yieldPct)} target · From {formatEur(selected.minTicketEur)}
            </span>
          </div>
          <a className="btn btn-primary" href={mobileCta.href}>
            {mobileCta.label}
          </a>
        </div>
      ) : null}
    </>
  );
}

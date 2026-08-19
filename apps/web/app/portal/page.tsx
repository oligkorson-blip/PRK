import Link from "next/link";
import { ensureInvestor } from "@/lib/auth/investor";
import { isTwoFactorEnabledForUser } from "@/lib/auth/queries";
import { TwoFactorOptionalBanner } from "@/components/two-factor-optional-banner";
import { formatEur } from "@/lib/format";
import { PORTAL_EMPTY, RISK_LINE } from "@/lib/copy/consumer";
import { listInterestStatusesForInvestor } from "@/lib/interests/queries";
import { getLatestApplicationStatusForInvestor } from "@/lib/investors/queries";
import { listHoldingsWithAssets } from "@/lib/portfolio/queries";
import { annualTargetIncomeEur, totalCommittedEur } from "@/lib/portfolio/summary";
import {
  buildAccessTimeline,
  type AccessTimelineStep
} from "@/lib/portal/access-timeline";
import { PortalAccessTimeline } from "@/components/portal-access-timeline";
import { PaymentHistoryPanel } from "@/components/payment-history-panel";
import {
  listDistributionsForInvestor,
  sumPaidIncomeForInvestor
} from "@/lib/portfolio/distributions";
import { countOpenAgreementsForInvestor } from "@/lib/contracts/portal-counts";
import { countConfirmedInterestsWithoutAgreementForInvestor } from "@/lib/interests/portal-counts";

function nextActionFromTimeline(steps: AccessTimelineStep[]): AccessTimelineStep | null {
  return (
    steps.find((s) => s.state === "current") ??
    steps.find((s) => s.state === "blocked") ??
    null
  );
}

function actionLabelForStep(step: AccessTimelineStep | null, pendingInterests: number): string {
  if (step?.href === "/contact") return "Talk to the team";
  if (step?.href === "/portal/kyc") return "Continue identity check";
  if (step?.href === "/portal/interests" || (!step?.href && pendingInterests > 0)) {
    return "View pending interests";
  }
  if (step?.href === "/portal/holdings") return "View investments";
  if (step?.href === "/portal/contracts") return "Open agreements";
  return "View opportunities";
}

export default async function PortalOverviewPage() {
  // Onboarding gate lives in app/portal/layout.tsx.
  const investor = await ensureInvestor();

  const myHoldings = await listHoldingsWithAssets(investor.id);

  const active = myHoldings.filter((h) => h.status === "active");
  const closed = myHoldings.filter((h) => h.status === "closed");
  const hasActiveHoldings = active.length > 0;
  const hasHoldings = myHoldings.length > 0;
  const committed = totalCommittedEur(active.map((h) => ({ amountEur: Number(h.amountEur) })));
  const annualTarget = annualTargetIncomeEur(
    active.map((h) => ({ amountEur: Number(h.amountEur), targetYieldPct: h.targetYieldPct }))
  );
  const monthlyTarget = Math.round(annualTarget / 12);
  const operators = new Set(active.map((h) => h.operator)).size;

  const interestStatuses = await listInterestStatusesForInvestor(investor.id);
  const pendingInterests = interestStatuses.filter((i) => i.status === "pending").length;

  const applicationStatus = await getLatestApplicationStatusForInvestor(investor.id);

  const [openAgreements, awaitingAgreement] = await Promise.all([
    countOpenAgreementsForInvestor(investor.id),
    countConfirmedInterestsWithoutAgreementForInvestor(investor.id)
  ]);

  const timeline = buildAccessTimeline({
    applicationStatus,
    accountStatus: investor.accountStatus,
    kycStatus: investor.kycStatus,
    pendingInterests,
    activeHoldings: active.length,
    openAgreements,
    awaitingAgreement: awaitingAgreement > 0
  });
  const nextAction = nextActionFromTimeline(timeline);

  const twoFactorEnabled = investor.authUserId
    ? await isTwoFactorEnabledForUser(investor.authUserId)
    : false;

  const [distributionRows, incomeReceived] = await Promise.all([
    listDistributionsForInvestor(investor.id),
    sumPaidIncomeForInvestor(investor.id)
  ]);

  const actionHref =
    nextAction?.href ??
    (pendingInterests > 0 ? "/portal/interests" : "/opportunities");
  const actionLabel = actionLabelForStep(nextAction, pendingInterests);

  if (!hasActiveHoldings && !hasHoldings) {
    return (
      <main className="dash-content">
        <section className="section-tight portal-page-head">
          <span className="portal-eyebrow">Getting started</span>
          <h1 className="display-m">Let&apos;s get your account ready</h1>
          <p className="lead">{PORTAL_EMPTY.gettingStarted}</p>
          {pendingInterests > 0 && investor.kycStatus !== "approved" ? (
            <div className="portal-banner" role="status">
              <p>
                {pendingInterests} pending interest{pendingInterests === 1 ? "" : "s"}. Please
                finish{" "}
                <Link className="link-arrow" href="/portal/kyc">
                  identity checks
                </Link>{" "}
                so we can confirm.
              </p>
            </div>
          ) : pendingInterests > 0 ? (
            <div className="portal-banner" role="status">
              <p>{PORTAL_EMPTY.waitingOnTeam}</p>
            </div>
          ) : null}
        </section>

        <section className="section-tight">
          <h2 className="display-s">Your progress</h2>
          <p className="field-hint">From invitation to your first confirmed investment.</p>
          <PortalAccessTimeline className="stack-4" steps={timeline} />
        </section>

        {!twoFactorEnabled ? <TwoFactorOptionalBanner /> : null}

        <section className="section-tight">
          <h2 className="display-s">What to do next</h2>
          {nextAction ? (
            <p className="lead">
              {nextAction.label}: {nextAction.detail}
            </p>
          ) : (
            <p className="lead">Browse open opportunities and register interest when ready.</p>
          )}
          <div className="apply-actions stack-4">
            <Link className="btn btn-primary" href={actionHref}>
              {actionLabel} <span className="arrow">→</span>
            </Link>
            <Link className="link-arrow" href="/contact">
              {PORTAL_EMPTY.contactForHelp}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dash-content">
      <section className="section-tight portal-page-head">
        <span className="portal-eyebrow">Your account</span>
        <h1 className="display-m">Portfolio overview</h1>
        <p className="lead">{PORTAL_EMPTY.portfolioLead}</p>
        <p className="field-hint risk-line">{RISK_LINE}</p>
        {pendingInterests > 0 && investor.kycStatus !== "approved" ? (
          <div className="portal-banner" role="status">
            <p>
              {pendingInterests} pending interest{pendingInterests === 1 ? "" : "s"}. Please finish{" "}
              <Link className="link-arrow" href="/portal/kyc">
                identity checks
              </Link>{" "}
              so we can confirm.
            </p>
          </div>
        ) : pendingInterests > 0 ? (
          <div className="portal-banner" role="status">
            <p>{PORTAL_EMPTY.waitingOnTeam}</p>
          </div>
        ) : null}
      </section>

      <section className="section-tight">
        <h2 className="display-s">Your progress</h2>
        <p className="field-hint">Where things stand — and what to do next.</p>
        <PortalAccessTimeline className="stack-4" steps={timeline} />
        {nextAction ? (
          <div className="apply-actions stack-4">
            <Link className="btn btn-primary" href={actionHref}>
              {actionLabel} <span className="arrow">→</span>
            </Link>
          </div>
        ) : null}
      </section>

      <section className="section-tight">
        <div className="dash-kpi-grid">
          <div className="dash-kpi">
            <span>Total invested</span>
            <b>{formatEur(committed)}</b>
            <small>Across active holdings</small>
          </div>
          <div className="dash-kpi">
            <span>Target monthly income</span>
            <b>{formatEur(monthlyTarget)}</b>
            <small>Target only — not money received</small>
          </div>
          <div className="dash-kpi">
            <span>Target annual income</span>
            <b>{formatEur(annualTarget)}</b>
            <small>Based on your amounts and target returns</small>
          </div>
          <div className="dash-kpi">
            <span>Active investments</span>
            <b>
              {active.length}
              {operators > 0 ? ` · ${operators} operator${operators === 1 ? "" : "s"}` : ""}
            </b>
            <small>Confirmed investments</small>
          </div>
        </div>
      </section>

      {!twoFactorEnabled ? <TwoFactorOptionalBanner /> : null}

      <section className="section-tight">
        <div className="dash-panel-grid">
          <article className="dash-panel">
            <h3>Income received</h3>
            <p className="muted-stat">{formatEur(incomeReceived)}</p>
            <p>
              {incomeReceived > 0
                ? "Total income paid to you so far."
                : "No payments yet."}
            </p>
          </article>
          {pendingInterests > 0 ? (
            <article className="dash-panel">
              <h3>Pending interests</h3>
              <p className="muted-stat">{pendingInterests}</p>
              <p>
                <Link className="link-arrow" href="/portal/interests">
                  View interests →
                </Link>
              </p>
            </article>
          ) : null}
          <article className="dash-panel">
            <h3>Documents and support</h3>
            <p className="stack-3">
              <Link className="link-arrow" href="/portal/documents">
                Open documents →
              </Link>
            </p>
            <p className="stack-3">
              <Link className="link-arrow" href="/contact">
                Talk to the team →
              </Link>
            </p>
          </article>
        </div>
        <p className="field-hint stack-4">
          {active.length > 0
            ? "Confirmed investments appear here once the team approves your request."
            : "No active investments right now. Closed investments remain available in your portfolio."}
        </p>
      </section>

      <section className="section-tight">
        {active.length > 0 ? (
          <>
            <h2 className="display-s">Your active investments</h2>
            <ul className="interest-list">
              {active.slice(0, 5).map((h) => (
                <li className="interest-card" key={h.id}>
                  <div className="interest-card-main">
                    <Link className="interest-card-name" href={`/portal/holdings/${h.id}`}>
                      {h.assetName}
                    </Link>
                    <p className="interest-card-meta">{formatEur(Number(h.amountEur))}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {closed.length > 0 ? (
          <div className={active.length > 0 ? "stack-7" : undefined}>
            <h2 className="display-s">Closed investments</h2>
            <ul className="interest-list">
              {closed.slice(0, 5).map((h) => (
                <li className="interest-card" key={h.id}>
                  <div className="interest-card-main">
                    <Link className="interest-card-name" href={`/portal/holdings/${h.id}`}>
                      {h.assetName}
                    </Link>
                    <p className="interest-card-meta">{formatEur(Number(h.amountEur))}</p>
                  </div>
                  <div className="interest-card-side">
                    <span className="badge badge-status-closed">Closed</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="section-tight">
        <PaymentHistoryPanel title="Income and payments" rows={distributionRows} />
      </section>

      <section className="section-tight">
        <div className="apply-actions">
          <Link className="btn btn-primary" href="/opportunities">
            View opportunities
          </Link>
          <Link className="btn btn-ghost" href="/portal/interests">
            View requests
          </Link>
          <Link className="btn btn-ghost" href="/portal/holdings">
            View investments
          </Link>
        </div>
      </section>
    </main>
  );
}

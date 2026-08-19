import Link from "next/link";
import { ensureInvestor } from "@/lib/auth/investor";
import { formatEur, formatYieldPct, formatDateDdMmYyyy } from "@/lib/format";
import { PORTAL_EMPTY } from "@/lib/copy/consumer";
import { listHoldingsWithAssets } from "@/lib/portfolio/queries";
import { annualTargetIncomeEur, totalCommittedEur } from "@/lib/portfolio/summary";

export default async function HoldingsPage() {
  // Onboarding gate lives in app/portal/layout.tsx.
  const investor = await ensureInvestor();

  const myHoldings = await listHoldingsWithAssets(investor.id);

  const active = myHoldings.filter((h) => h.status === "active");
  const committed = totalCommittedEur(active);
  const annualTarget = annualTargetIncomeEur(active);
  const monthlyTarget = Math.round(annualTarget / 12);

  return (
    <main className="dash-content">
      <section className="section-tight portal-page-head">
        <span className="portal-eyebrow">Confirmed investments</span>
        <h1 className="display-m">Your portfolio</h1>
        <p className="lead">
          Review each investment, its target income, documents, and recorded payments in one place.
          Target income remains an estimate until a payment is received.
        </p>
        {active.length > 0 ? (
          <div className="funding-figures">
            <div className="figure">
              <b>{formatEur(committed)}</b>
              <span>total invested</span>
            </div>
            <div className="figure">
              <b>{formatEur(monthlyTarget)}</b>
              <span>target monthly income</span>
            </div>
            <div className="figure">
              <b>{formatEur(annualTarget)}</b>
              <span>target annual income</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="section-tight">
        {myHoldings.length === 0 ? (
          <div className="empty-state">
            <h2 className="h3">No confirmed investments yet</h2>
            <p className="lead">{PORTAL_EMPTY.noHoldings}</p>
            <Link className="btn btn-primary" href="/opportunities">
              View opportunities
            </Link>
          </div>
        ) : (
          <ul className="interest-list">
            {myHoldings.map((holding) => {
              const amount = Number(holding.amountEur);
              const isActive = holding.status === "active";
              const annual = Math.round((amount * Number(holding.targetYieldPct)) / 100);
              const monthly = Math.round(annual / 12);
              return (
                <li className="interest-card" key={holding.id}>
                  <div className="interest-card-main">
                    <Link
                      className="interest-card-name"
                      href={`/portal/holdings/${holding.id}`}
                    >
                      {holding.assetName}
                    </Link>
                    <p className="interest-card-meta">
                      {formatEur(holding.amountEur)} · Target {formatYieldPct(holding.targetYieldPct)}{" "}
                      · Confirmed {formatDateDdMmYyyy(holding.confirmedAt)}
                    </p>
                    <p className="field-hint">
                      {isActive
                        ? `Target monthly ${formatEur(monthly)} · annual ${formatEur(annual)}. Not money received.`
                        : `Historical target monthly ${formatEur(monthly)} · annual ${formatEur(annual)}. No future income is implied.`}
                    </p>
                  </div>
                  <div className="interest-card-side">
                    <span
                      className={`badge ${holding.status === "active" ? "badge-status-confirmed" : "badge-status-closed"}`}
                    >
                      {holding.status === "active" ? "Active" : "Closed"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

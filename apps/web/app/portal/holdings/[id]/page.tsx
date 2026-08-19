import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureInvestor } from "@/lib/auth/investor";
import { formatEur, formatYieldPct, formatDateDdMmYyyy, isUuid } from "@/lib/format";
import { getHoldingWithAssetForInvestor } from "@/lib/portfolio/queries";
import { RISK_LINE_SHORT } from "@/lib/copy/consumer";
import { CardArt } from "@/components/card-art";
import { PaymentHistoryPanel } from "@/components/payment-history-panel";
import { listDistributionsForHolding } from "@/lib/portfolio/distributions";

export default async function HoldingDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  // Onboarding gate lives in app/portal/layout.tsx.
  const investor = await ensureInvestor();

  const row = await getHoldingWithAssetForInvestor(investor.id, id);

  if (!row) notFound();

  const amount = Number(row.amountEur);
  const yieldPct = Number(row.targetYieldPct);
  const annual = Math.round((amount * yieldPct) / 100);
  const monthly = Math.round(annual / 12);
  const distributionRows = await listDistributionsForHolding(investor.id, row.id);

  return (
    <main className="dash-content">
      <section className="section-tight portal-page-head">
        <p className="field-hint">
          <Link href="/portal/holdings">Investments</Link> / {row.assetName}
        </p>
        <h1 className="display-m">{row.assetName}</h1>
        <p className="lead">
          {row.city}, {row.country}
          {row.siteType ? ` · ${row.siteType}` : ""} · {row.spaces.toLocaleString("en-IE")} spaces
        </p>
        <p className="field-hint">{RISK_LINE_SHORT}</p>
      </section>

      <section className="section-tight">
        <div className="holding-detail-grid">
          <div className="holding-detail-visual" aria-hidden="true">
            <CardArt variant={row.artVariant ?? 0} idSuffix={row.id} />
          </div>
          <div className="dash-kpi-grid">
            <div className="dash-kpi">
              <span>Invested</span>
              <b>{formatEur(amount)}</b>
              <small>Confirmed investment</small>
            </div>
            <div className="dash-kpi">
              <span>Target return</span>
              <b>{formatYieldPct(row.targetYieldPct)}</b>
              <small>Target only</small>
            </div>
            <div className="dash-kpi">
              <span>{row.status === "active" ? "Target monthly income" : "Historical monthly target"}</span>
              <b>{formatEur(monthly)}</b>
              <small>{row.status === "active" ? "Not money received" : "No future income implied"}</small>
            </div>
            <div className="dash-kpi">
              <span>{row.status === "active" ? "Target annual income" : "Historical annual target"}</span>
              <b>{formatEur(annual)}</b>
              <small>{row.status === "active" ? "Based on your amount and target return" : "For reference only"}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="dash-panel-grid">
          <article className="dash-panel">
            <h3>Status</h3>
            <p className="muted-stat muted-stat-sm">
              {row.status === "active" ? "Active" : "Closed"}
            </p>
            <p>Confirmed {formatDateDdMmYyyy(row.confirmedAt)}</p>
          </article>
          <article className="dash-panel">
            <h3>Operator</h3>
            <p className="muted-stat muted-stat-sm">
              {row.operator}
            </p>
            <p>Day-to-day site management</p>
          </article>
        </div>
        <p className="field-hint stack-4">
          {row.status === "active" ? "Payments follow your deal documents." : "This holding is closed. Any figures above are historical targets; no future distributions are implied."}
        </p>
      </section>

      <section className="section-tight">
        <PaymentHistoryPanel rows={distributionRows} />
      </section>

      <section className="section-tight">
        <div className="apply-actions">
          {row.assetStatus === "published" ? (
            <Link className="btn btn-primary" href={`/opportunities/${row.assetSlug}`}>
              View opportunity
            </Link>
          ) : (
            <span className="badge badge-status-closed">Opportunity closed</span>
          )}
          <Link className="btn btn-ghost" href="/portal/documents">
            Documents
          </Link>
          <Link className="btn btn-ghost" href="/contact">
            Support
          </Link>
        </div>
      </section>
    </main>
  );
}

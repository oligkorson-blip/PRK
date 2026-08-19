import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminDistributionForm } from "@/components/admin-distribution-form";
import { AdminDistributionBatchForm } from "@/components/admin-distribution-batch-form";
import { AdminDistributionCancelButton } from "@/components/admin-distribution-cancel-button";
import {
  listActiveHoldingsForAdmin,
  listRecentDistributions
} from "@/lib/portfolio/queries";
import { formatEur, formatDateDdMmYyyy } from "@/lib/format";
import {
  formatDistributionStatus,
  formatDistributionType
} from "@/lib/portfolio/distributions";

const DISTRIBUTION_STATUS_PILL: Record<string, string> = {
  paid: "stage-pill-clear",
  scheduled: "stage-pill-awaiting",
  failed: "stage-pill-blocking",
  cancelled: "stage-pill-muted"
};

export default async function AdminDistributionsPage() {
  try {
    await requireStaff();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/");
    }
    throw error;
  }

  // listRecentDistributions already scopes to the caller's book in SQL;
  // intersecting with active holdings here would drop in-book distributions
  // recorded on holdings that have since closed.
  const [holdings, recent] = await Promise.all([
    listActiveHoldingsForAdmin(),
    listRecentDistributions(50)
  ]);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Payments"
        subtitle="Schedule and record investor payments. Confirmed entries appear in the investor portal."
      />

      <AdminDistributionForm
        holdings={holdings.map((h) => ({
          id: h.id,
          amountEur: Number(h.amountEur),
          investorEmail: h.investorEmail,
          assetName: h.assetName
        }))}
      />

      <AdminDistributionBatchForm
        holdings={holdings.map((h) => ({
          id: h.id,
          amountEur: Number(h.amountEur),
          investorEmail: h.investorEmail,
          assetName: h.assetName
        }))}
      />

      <section className="section-foot">
        <h2 className="h3">Recent records</h2>
        {recent.length === 0 ? (
          <p className="lead stack-3">
            No distributions recorded yet.
          </p>
        ) : (
          <div className="table-wrap stack-4">
            <table className="admin-table distributions-table">
              <thead>
                <tr>
                  <th scope="col">Investor</th>
                  <th scope="col">Opportunity</th>
                  <th scope="col" className="cell-amount">Amount</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Period</th>
                  <th scope="col">Paid</th>
                  <th scope="col" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-email" title={row.investorEmail}>
                      <Link href={`/admin/investors/${row.investorId}`}>{row.investorEmail}</Link>
                      <div className="distribution-phone-metrics">
                        {row.assetName} · <strong>{formatEur(Number(row.amountEur))}</strong>
                        <br />
                        {formatDistributionType(row.type)} · {row.periodLabel ?? "No period"} · {formatDistributionStatus(row.status)}{" "}
                        {row.status === "paid" && row.paidAt ? formatDateDdMmYyyy(row.paidAt) : "—"}
                      </div>
                    </td>
                    <td>{row.assetName}</td>
                    <td className="cell-amount">{formatEur(Number(row.amountEur))}</td>
                    <td>
                      <span className="stage-pill stage-pill-muted">
                        {formatDistributionType(row.type)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`stage-pill ${DISTRIBUTION_STATUS_PILL[row.status] ?? "stage-pill-muted"}`}
                      >
                        {formatDistributionStatus(row.status)}
                      </span>
                    </td>
                    <td>{row.periodLabel ?? "—"}</td>
                    <td>
                      {row.paidAt ? formatDateDdMmYyyy(row.paidAt) : "—"}
                    </td>
                    <td>
                      {row.status === "scheduled" || row.status === "paid" ? (
                        <AdminDistributionCancelButton distributionId={row.id} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

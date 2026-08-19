import Link from "next/link";
import {
  formatDistributionAmount,
  formatDistributionStatus,
  formatDistributionType,
  type DistributionRow
} from "@/lib/portfolio/distributions";
import { formatDateDdMmYyyy } from "@/lib/format";

/**
 * Payment history panel.
 * Shows recorded ledger rows when present; never invents payments.
 */
export function PaymentHistoryPanel({
  title = "Payment history",
  rows = []
}: {
  title?: string;
  rows?: DistributionRow[];
}) {
  const hasRows = rows.length > 0;
  // The ledger also holds scheduled/failed/cancelled rows — only paid rows
  // are actual payments, so the badge counts just those.
  const paidCount = rows.filter((row) => row.status === "paid").length;

  return (
    <div className="dash-panel payment-history-panel">
      <div className="payment-history-head">
        <h2 className="h4">{title}</h2>
        <span className="badge badge-soft">
          {paidCount > 0 ? `${paidCount} payment${paidCount === 1 ? "" : "s"}` : "No payments yet"}
        </span>
      </div>
      <p className="lead stack-2">
        {paidCount > 0
          ? "Payments we've sent you. Target income elsewhere is an estimate until paid."
          : hasRows
            ? "Payment activity appears here. Scheduled, failed, or cancelled items are not payments."
            : "Your payment history will show up here once money is paid out."}
      </p>
      {hasRows ? (
        <div className="table-wrap stack-4">
          <table className="data data-compact">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="hide-mobile">Type</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.paidAt
                      ? formatDateDdMmYyyy(row.paidAt)
                      : row.periodLabel ?? "—"}
                  </td>
                  <td className="hide-mobile">{formatDistributionType(row.type)}</td>
                  <td>{formatDistributionAmount(row.amountEur)}</td>
                  <td>{formatDistributionStatus(row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="stack-4">
        <Link className="link-arrow" href="/guides/what-monthly-distributions-mean">
          What monthly distributions mean →
        </Link>
      </p>
    </div>
  );
}

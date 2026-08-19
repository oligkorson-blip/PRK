"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordDistributionBatch } from "@/lib/portfolio/admin-distributions";
import { formatEur } from "@/lib/format";

type HoldingOption = {
  id: string;
  amountEur: number;
  investorEmail: string;
  assetName: string;
};

export function AdminDistributionBatchForm({ holdings }: { holdings: HoldingOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"scheduled" | "paid">("scheduled");

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected]
  );

  if (holdings.length === 0) return null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const form = event.currentTarget;
    const fd = new FormData(form);
    const type = String(fd.get("type") ?? "income") as "income" | "return_of_capital" | "other";
    const submittedStatus = String(fd.get("status") ?? "scheduled") as "scheduled" | "paid";
    const periodLabel = String(fd.get("periodLabel") ?? "");
    const paidAt = String(fd.get("paidAt") ?? "") || null;
    const note = String(fd.get("note") ?? "");

    const items = selectedIds.map((holdingId) => ({
      holdingId,
      amountEur: Number(amounts[holdingId] || 0)
    }));

    startTransition(async () => {
      const result = await recordDistributionBatch({
        items,
        type,
        status: submittedStatus,
        periodLabel,
        paidAt,
        note
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const failNote =
        result.failures.length > 0
          ? ` ${result.failures.length} failed.`
          : "";
      setSuccess(
        `Recorded ${result.recorded}` +
          (result.pendingSecondApproval
            ? `, ${result.pendingSecondApproval} awaiting second approval`
            : "") +
          `.${failNote}`
      );
      setSelected({});
      router.refresh();
    });
  }

  return (
    <form className="form-card admin-distribution-form stack-6" onSubmit={handleSubmit}>
      <fieldset className="form-fieldset" disabled={isPending}>
        <legend className="sr-only">Batch distribution</legend>
        <h2 className="h3">Batch payments</h2>
        <p className="field-hint">
          Same period and status for multiple investments. Enter each amount separately. Large
          amounts still need four-eyes.
        </p>

        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Include</th>
                <th scope="col">Investment</th>
                <th scope="col">Amount (EUR)</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[h.id])}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [h.id]: e.target.checked }))
                      }
                      aria-label={`Include ${h.investorEmail} ${h.assetName}`}
                    />
                  </td>
                  <td>
                    {h.investorEmail} · {h.assetName} · ticket {formatEur(h.amountEur)}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={amounts[h.id] ?? ""}
                      onChange={(e) =>
                        setAmounts((prev) => ({ ...prev, [h.id]: e.target.value }))
                      }
                      disabled={!selected[h.id]}
                      required={Boolean(selected[h.id])}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid-2">
          <label className="form-field">
            <span>Payment reference</span>
            <input name="periodLabel" type="text" maxLength={80} required />
          </label>
          <label className="form-field">
            <span>Type</span>
            <select name="type" defaultValue="income">
              <option value="income">Income</option>
              <option value="return_of_capital">Return of capital</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="grid-2">
          <label className="form-field">
            <span>Status</span>
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="scheduled">Scheduled</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <label className="form-field">
            <span>Paid date</span>
            <input name="paidAt" type="date" required={status === "paid"} disabled={status !== "paid"} />
          </label>
        </div>

        <label className="form-field">
          <span>Note (optional)</span>
          <textarea name="note" rows={2} maxLength={500} />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="field-hint" role="status">
            {success}
          </p>
        ) : null}

        <button className="btn btn-primary" type="submit" disabled={isPending || selectedIds.length === 0}>
          {isPending ? "Saving…" : `Record batch (${selectedIds.length})`}
        </button>
      </fieldset>
    </form>
  );
}

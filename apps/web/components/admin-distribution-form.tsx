"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordDistribution } from "@/lib/portfolio/admin-distributions";
import { formatEur } from "@/lib/format";

type HoldingOption = {
  id: string;
  amountEur: number;
  investorEmail: string;
  assetName: string;
};

export function AdminDistributionForm({ holdings }: { holdings: HoldingOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"scheduled" | "paid" | "failed" | "cancelled">("scheduled");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (success) {
      successRef.current?.focus();
    }
  }, [error, isPending, success]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const form = event.currentTarget;
    const fd = new FormData(form);
    const holdingId = String(fd.get("holdingId") ?? "");
    const amountEur = Number(fd.get("amountEur"));
    const type = String(fd.get("type") ?? "income") as "income" | "return_of_capital" | "other";
    const submittedStatus = String(fd.get("status") ?? "scheduled") as
      | "scheduled"
      | "paid"
      | "failed"
      | "cancelled";
    const periodLabel = String(fd.get("periodLabel") ?? "");
    const paidAt = String(fd.get("paidAt") ?? "") || null;
    const note = String(fd.get("note") ?? "");

    startTransition(async () => {
      try {
        const result = await recordDistribution({
          holdingId,
          amountEur,
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
        setSuccess(
          result.pendingSecondApproval
            ? "First approval recorded — a second super admin must approve before it posts."
            : "Distribution recorded. It will show on the investor dashboard."
        );
        form.reset();
        setStatus("scheduled");
        router.refresh();
      } catch {
        setError("The distribution could not be recorded. Please try again.");
      }
    });
  }

  if (holdings.length === 0) {
    return (
      <p className="lead">
        No active investments in your scope yet.{" "}
        <Link className="link-arrow" href="/admin/interests">
          Confirm an interest first
        </Link>
        , then record a distribution here.
      </p>
    );
  }

  return (
    <form className="form-card admin-distribution-form" onSubmit={handleSubmit} aria-busy={isPending}>
      <fieldset className="form-fieldset" disabled={isPending}>
        <legend className="sr-only">Distribution details</legend>
        <h2 className="h3">Record a distribution</h2>
        <p className="field-hint">
          Posts to the investor payment ledger. Use whole euro amounts. Do not invent payments.
        </p>

        <label className="form-field">
          <span>Investment</span>
          <select name="holdingId" required defaultValue="" disabled={isPending}>
            <option value="" disabled>
              Select investment
            </option>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.investorEmail} · {h.assetName} · {formatEur(h.amountEur)}
              </option>
            ))}
          </select>
        </label>

        <div className="grid-2">
          <label className="form-field">
            <span>Amount (EUR)</span>
            <input
              name="amountEur"
              type="number"
              min={1}
              step={1}
              required
              disabled={isPending}
            />
          </label>
          <label className="form-field">
            <span>Payment reference</span>
            <input
              name="periodLabel"
              type="text"
              maxLength={80}
              placeholder="e.g. Jul 2026 or BANK-123"
              required
              disabled={isPending}
            />
          </label>
        </div>

        <div className="grid-2">
          <label className="form-field">
            <span>Type</span>
            <select name="type" defaultValue="income" disabled={isPending}>
              <option value="income">Income</option>
              <option value="return_of_capital">Return of capital</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="form-field">
            <span>Status</span>
            <select
              name="status"
              value={status}
              disabled={isPending}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="paid">Paid</option>
              <option value="scheduled">Scheduled</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>

        <label className="form-field">
          <span>{status === "paid" ? "Paid date" : "Paid date (available when status is Paid)"}</span>
          <input
            name="paidAt"
            type="date"
            required={status === "paid"}
            disabled={isPending || status !== "paid"}
          />
        </label>

        <label className="form-field">
          <span>Note (optional)</span>
          <textarea name="note" rows={2} maxLength={500} disabled={isPending} />
        </label>

        {error ? (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            ref={successRef}
            className="field-hint"
            role="status"
            aria-live="polite"
            tabIndex={-1}
          >
            {success}
          </p>
        ) : null}

        <button className="btn btn-primary" type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Record distribution"}
        </button>
      </fieldset>
    </form>
  );
}

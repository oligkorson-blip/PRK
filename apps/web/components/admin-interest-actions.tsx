"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmInterest, declineInterest } from "@/lib/interests/admin-actions";
import type { ConfirmPreflight } from "@/lib/interests/confirm-preflight";
import { KYC_STATUS_LABEL } from "@/lib/portal/labels";

export function AdminInterestActions({
  interestId,
  kycStatus,
  pendingApprovalByEmail,
  preflight
}: {
  interestId: string;
  kycStatus: string;
  /** Email of the super admin who recorded the first approval (four-eyes). */
  pendingApprovalByEmail?: string | null;
  preflight?: ConfirmPreflight | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"confirm" | "decline" | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (notice) {
      noticeRef.current?.focus();
    }
  }, [error, isPending, notice]);

  const kycOk = kycStatus === "approved";
  const kycLabel = KYC_STATUS_LABEL[kycStatus] ?? kycStatus;
  const canConfirm = preflight ? preflight.canConfirm : kycOk;

  function handleDecide(action: "confirm" | "decline") {
    setError(null);
    setNotice(null);
    setPendingAction(action);
    startTransition(async () => {
      try {
        const result =
          action === "confirm"
            ? await confirmInterest({ interestId, adminNote: note })
            : await declineInterest({ interestId, adminNote: note });
        if (result.ok) {
          if (result.pendingSecondApproval) {
            setNotice("First approval recorded — a second super admin must confirm.");
          } else {
            setNotice(
              action === "confirm"
                ? "Interest confirmed — holding created. Create an agreement when ready."
                : "Interest declined"
            );
          }
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The decision could not be saved. Please try again.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleDecline() {
    if (!window.confirm("Decline this interest? The investor will be notified.")) return;
    handleDecide("decline");
  }

  return (
    <div className="admin-interest-actions">
      {preflight ? (
        <ul className="admin-preflight-list">
          {preflight.checks.map((check) => (
            <li key={check.id} className={check.ok ? "is-ok" : "is-blocked"}>
              <span>{check.ok ? "✓" : "•"}</span> {check.label}
              {!check.ok ? <span className="field-hint"> — {check.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : !kycOk ? (
        <p className="field-hint">KYC: {kycLabel} — confirm blocked until approved.</p>
      ) : null}
      {pendingApprovalByEmail ? (
        <p className="field-hint">Awaiting second approval (approved by {pendingApprovalByEmail})</p>
      ) : null}
      <label className="form-field">
        <span>Admin note (optional)</span>
        <textarea
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={isPending}
        />
      </label>
      <div className="admin-interest-actions-buttons">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => handleDecide("confirm")}
          disabled={isPending || !canConfirm}
          title={!canConfirm ? "Clear preflight blockers first" : undefined}
        >
          {pendingAction === "confirm" ? "Working…" : "Confirm"}
        </button>
        <button
          className="btn btn-danger btn-sm"
          type="button"
          onClick={handleDecline}
          disabled={isPending}
        >
          {pendingAction === "decline" ? "Working…" : "Decline"}
        </button>
      </div>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          ref={noticeRef}
          className="field-hint"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}

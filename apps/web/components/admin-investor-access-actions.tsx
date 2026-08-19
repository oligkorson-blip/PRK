"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveAndInvite,
  markApplicationContacted,
  regenerateInvite,
  rejectApplication
} from "@/lib/apply/admin-actions";
import { setKycStatus } from "@/lib/kyc/actions";
import {
  canRejectApplication,
  canRejectKyc,
  deriveInvestorActionPlan,
  type InvestorActionId
} from "@/lib/investors/next-action";
import { OPERATIONS_ACTION_ERROR } from "@/lib/copy/operations";

type ActionResult = {
  ok: boolean;
  error?: string;
  inviteUrl?: string;
  emailSent?: boolean;
};

export function AdminInvestorAccessActions({
  investorId,
  email,
  accountStatus,
  kycStatus,
  applicationStatus
}: {
  investorId: string;
  email: string;
  accountStatus: string;
  kycStatus: string;
  applicationStatus?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const messageRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const deliveryRef = useRef<HTMLParagraphElement>(null);
  const rejectNoteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (emailSent === false) {
      deliveryRef.current?.focus();
    } else if (message) {
      messageRef.current?.focus();
    }
  }, [emailSent, error, isPending, message]);

  useEffect(() => {
    if (rejectOpen) {
      rejectNoteRef.current?.focus();
    }
  }, [rejectOpen]);

  const plan = deriveInvestorActionPlan({ accountStatus, applicationStatus, kycStatus });
  const primary = plan.actions.find((a) => a.id === plan.primary) ?? null;
  const secondary = plan.actions.filter((a) => a.id !== plan.primary);
  const rejectNoteReady = rejectNote.trim().length > 0;

  const runners: Record<InvestorActionId, () => Promise<ActionResult>> = {
    mark_contacted: () => markApplicationContacted(investorId),
    approve_invite: () => approveAndInvite(investorId),
    regenerate_invite: () => regenerateInvite(investorId),
    kyc_under_review: () => setKycStatus({ investorId, status: "under_review" }),
    approve_kyc: () => setKycStatus({ investorId, status: "approved" })
  };

  function inviteMessage(result: ActionResult): string {
    return result.emailSent === false
      ? "Invite created — the email was not delivered; copy the link below."
      : `Invite sent to ${email}.`;
  }

  const successMessages: Record<InvestorActionId, (result: ActionResult) => string> = {
    mark_contacted: () => "Application marked as contacted.",
    approve_invite: inviteMessage,
    regenerate_invite: inviteMessage,
    kyc_under_review: () => "KYC moved to under review.",
    approve_kyc: () => "KYC approved."
  };

  function run(action: () => Promise<ActionResult>, successMessage: (result: ActionResult) => string) {
    setError(null);
    setMessage(null);
    setEmailSent(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error ?? OPERATIONS_ACTION_ERROR);
          return;
        }
        if (result.inviteUrl) setInviteUrl(result.inviteUrl);
        if (typeof result.emailSent === "boolean") setEmailSent(result.emailSent);
        setMessage(successMessage(result));
        setRejectOpen(false);
        setRejectNote("");
        router.refresh();
      } catch {
        setError(OPERATIONS_ACTION_ERROR);
      }
    });
  }

  return (
    <div className="admin-access-actions">
      {primary ? (
        <div className="apply-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={isPending}
            onClick={() => run(runners[primary.id], successMessages[primary.id])}
          >
            {primary.label}
          </button>
        </div>
      ) : (
        <p className="field-hint">No next action — this record is up to date.</p>
      )}

      <div className="stack-3">
        <p className="field-hint">Other lifecycle actions</p>
        {secondary.map((action) => (
          <p key={action.id} className="field-hint admin-access-secondary">
            <button type="button" className="btn btn-ghost" disabled>
              {action.label}
            </button>{" "}
            {action.reason}
          </p>
        ))}
      </div>

      {!rejectOpen ? (
        <div className="apply-actions stack-3">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={isPending}
            onClick={() => setRejectOpen(true)}
          >
            Reject…
          </button>
        </div>
      ) : (
        <div className="stack-3">
          <label className="form-field" style={{ display: "block", maxWidth: 420 }}>
            <span>Rejection note (required — the KYC reason is shown to the investor)</span>
            <textarea
              ref={rejectNoteRef}
              rows={3}
              maxLength={500}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              disabled={isPending}
              placeholder="Why is this being rejected?"
            />
          </label>
          <div className="apply-actions stack-2">
            <button
              type="button"
              className="btn btn-danger"
              disabled={isPending || !rejectNoteReady || !canRejectApplication(applicationStatus)}
              title={
                canRejectApplication(applicationStatus)
                  ? undefined
                  : "Only a submitted or contacted application can be rejected."
              }
              onClick={() => {
                if (!window.confirm("Reject this application? This cannot be undone from here.")) return;
                run(
                  () => rejectApplication(investorId, rejectNote.trim()),
                  () => "Application rejected."
                );
              }}
            >
              Reject application
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={isPending || !rejectNoteReady || !canRejectKyc(kycStatus)}
              title={
                canRejectKyc(kycStatus)
                  ? undefined
                  : "Only a submitted or under-review KYC can be rejected."
              }
              onClick={() => {
                if (!window.confirm("Reject this KYC submission? This cannot be undone from here.")) return;
                run(
                  () => setKycStatus({ investorId, status: "rejected", reason: rejectNote.trim() }),
                  () => "KYC rejected."
                );
              }}
            >
              Reject KYC
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={isPending}
              onClick={() => {
                setRejectOpen(false);
                setRejectNote("");
              }}
            >
              Cancel
            </button>
          </div>
          {!rejectNoteReady ? (
            <p className="field-hint">Add a note to enable the reject buttons.</p>
          ) : null}
        </div>
      )}

      {inviteUrl ? (
        <div className="stack-3">
          <p className="field-hint wrap-anywhere">
            Invite URL (copy out-of-band only — never into public tickets): {inviteUrl}
          </p>
          {emailSent === false ? (
            <p
              ref={deliveryRef}
              className="form-error"
              role="status"
              aria-live="polite"
              tabIndex={-1}
            >
              Invite email was not delivered (SMTP unset or send failed). Copy the set-password
              link and send it on a secure channel within 72 hours. Do not paste the full URL into
              tickets or chat logs — see SETUP invite runbook. Prefer SMTP before volume.
            </p>
          ) : emailSent === true ? (
            <p className="field-hint">Invite email sent.</p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          ref={messageRef}
          className="field-hint"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

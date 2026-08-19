"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { submitKycForReview, uploadKycDocument } from "@/lib/kyc/actions";
import { KYC_CATEGORY_LABEL } from "@/lib/kyc/categories";
import {
  KYC_DOCUMENTS_LOCKED,
  KYC_SUBMIT_CONNECTION_ERROR,
  KYC_UPLOADS_ACTIVE_ONLY,
  KYC_UPLOAD_CONNECTION_ERROR
} from "@/lib/copy/kyc";
import { KYC_STATUS_LABEL } from "@/lib/portal/labels";

export function KycUploadForm({
  kycStatus,
  accountStatus,
  rejectReason,
  accountType,
  uploadedCategories
}: {
  kycStatus: string;
  accountStatus: string;
  rejectReason?: string | null;
  accountType: "individual" | "company";
  uploadedCategories: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const okRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (ok) {
      okRef.current?.focus();
    }
  }, [error, isPending, ok]);

  function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOk(null);
    const form = event.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        const result = await uploadKycDocument(fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOk("Document uploaded. Add another file or submit your documents when they’re ready.");
        form.reset();
        router.refresh();
      } catch {
        setError(KYC_UPLOAD_CONNECTION_ERROR);
      }
    });
  }

  function handleSubmit() {
    setError(null);
    setOk(null);
    startTransition(async () => {
      try {
        const result = await submitKycForReview();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOk("Submitted for review.");
        router.refresh();
      } catch {
        setError(KYC_SUBMIT_CONNECTION_ERROR);
      }
    });
  }

  const statusLabel = KYC_STATUS_LABEL[kycStatus] ?? kycStatus;
  const accountActive = accountStatus === "active";
  const requiredCategories = accountType === "company" ? ["kyc_id", "kyc_address", "kyc_company"] : ["kyc_id", "kyc_address"];
  const missingCategories = requiredCategories.filter((category) => !uploadedCategories.includes(category));
  const canSubmit = accountActive && (kycStatus === "not_started" || kycStatus === "rejected");
  const canSubmitForReview = canSubmit && missingCategories.length === 0;
  const lockedMessage = !accountActive
    ? KYC_UPLOADS_ACTIVE_ONLY
    : kycStatus === "approved"
      ? "Your identity check is approved. No further documents are needed."
      : KYC_DOCUMENTS_LOCKED;

  return (
    <div className="kyc-forms">
      <p className="field-hint">Status: {statusLabel}</p>
      {kycStatus === "rejected" && rejectReason ? (
        <div className="portal-banner stack-4" role="status">
          <p>
            <strong>We couldn&apos;t verify that document.</strong> {rejectReason} Upload a
            corrected file and submit again.
          </p>
        </div>
      ) : null}
      {canSubmit ? (
      <form className="interest-form" onSubmit={handleUpload} aria-busy={isPending}>
        <fieldset className="form-fieldset" disabled={isPending}>
          <legend className="sr-only">Document upload</legend>
          <label className="form-field">
            <span>Category</span>
            <select name="category" defaultValue="kyc_id">
              {Object.entries(KYC_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>File (PDF / JPEG / PNG, max 10 MB)</span>
            <input name="file" type="file" accept=".pdf,image/jpeg,image/png" required />
          </label>
          <button className="btn btn-ghost" type="submit" disabled={isPending}>
            {isPending ? "Uploading…" : "Upload"}
          </button>
        </fieldset>
      </form>
      ) : (
        <p className="field-hint">{lockedMessage}</p>
      )}
      <p className="field-hint">Required: {requiredCategories.map((category) => KYC_CATEGORY_LABEL[category]).join(", ")}.</p>
      {canSubmit ? (
        <button className="btn btn-primary" type="button" disabled={isPending || !canSubmitForReview} onClick={handleSubmit}>
          {isPending ? "Submitting…" : canSubmitForReview ? "Submit for review" : `Upload ${missingCategories.map((category) => KYC_CATEGORY_LABEL[category]).join(" and ")} first`}
        </button>
      ) : null}
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {ok ? (
        <p
          ref={okRef}
          className="field-hint"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          {ok}
        </p>
      ) : null}
    </div>
  );
}
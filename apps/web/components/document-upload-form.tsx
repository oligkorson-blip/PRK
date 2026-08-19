"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUploadDocument } from "@/lib/documents/actions";
import { formatEur } from "@/lib/format";
import {
  OPERATIONS_DOCUMENT_UPLOAD_ERROR,
  OPERATIONS_DOCUMENT_UPLOAD_UNAVAILABLE
} from "@/lib/copy/operations";

type AssetOption = { id: string; name: string };
type HoldingOption = { id: string; investorEmail: string; assetName: string; amountEur: number };
type InvestorOption = { id: string; email: string; fullName: string };

/** Controlled vocabulary for the vault category — keep in sync with staff wording. */
const DOCUMENT_CATEGORIES = ["KID", "IM", "Contract", "Statement", "Report", "Other"] as const;

export function DocumentUploadForm({
  assets,
  holdings,
  investors,
  isSuperAdmin = false,
  storageConfigured = true
}: {
  assets: AssetOption[];
  holdings: HoldingOption[];
  investors: InvestorOption[];
  isSuperAdmin?: boolean;
  storageConfigured?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const messageRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (message) {
      messageRef.current?.focus();
    }
  }, [error, message, pending]);
  // Asset/platform uploads are super_admin-only (enforced server-side); other roles get holding only.
  const defaultOwnerType = isSuperAdmin ? "asset" : "holding";
  const [ownerType, setOwnerType] = useState<"asset" | "holding" | "investor" | "platform">(
    defaultOwnerType
  );

  return (
    <form
      className="form-card"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setMessage(null);
        setError(null);
        startTransition(async () => {
          try {
            const result = await adminUploadDocument(data);
            if (result.ok) {
              setMessage("Document uploaded. It now appears in the vault listing below.");
              form.reset();
              setOwnerType(defaultOwnerType);
              router.refresh();
            } else {
              setError(result.error);
            }
          } catch {
            setError(OPERATIONS_DOCUMENT_UPLOAD_ERROR);
          }
        });
      }}
    >
      {!storageConfigured ? (
        <p className="form-error" role="alert">
          {OPERATIONS_DOCUMENT_UPLOAD_UNAVAILABLE}
        </p>
      ) : null}
      <fieldset className="form-fieldset" disabled={!storageConfigured || pending}>
      <div className="form-field">
        <label htmlFor="ownerType">Owner type</label>
        <select
          id="ownerType"
          name="ownerType"
          value={ownerType}
          onChange={(e) => setOwnerType(e.target.value as typeof ownerType)}
        >
          {isSuperAdmin ? <option value="asset">Asset</option> : null}
          <option value="holding">Holding</option>
          <option value="investor">Investor</option>
          {isSuperAdmin ? <option value="platform">Platform</option> : null}
        </select>
      </div>

      {ownerType === "asset" ? (
        <div className="form-field">
          <label htmlFor="ownerId">Asset</label>
          <select id="ownerId" name="ownerId" required>
            <option value="">Select asset</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : ownerType === "holding" ? (
        <div className="form-field">
          <label htmlFor="ownerId">Investment</label>
          <select id="ownerId" name="ownerId" required>
            <option value="">Select investment</option>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.investorEmail} · {h.assetName} · {formatEur(h.amountEur)}
              </option>
            ))}
          </select>
        </div>
      ) : ownerType === "investor" ? (
        <div className="form-field">
          <label htmlFor="ownerId">Investor</label>
          <select id="ownerId" name="ownerId" required>
            <option value="">Select investor</option>
            {investors.map((investor) => (
              <option key={investor.id} value={investor.id}>
                {investor.fullName ? `${investor.fullName} · ${investor.email}` : investor.email}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="ownerId" value="" />
      )}

      <div className="form-field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={200} />
      </div>
      <div className="form-field">
        <label htmlFor="category">Category</label>
        <select id="category" name="category" required defaultValue="">
          <option value="" disabled>
            Select category
          </option>
          {DOCUMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="file">PDF file</label>
        <input id="file" name="file" type="file" accept="application/pdf" required />
      </div>

      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          ref={messageRef}
          className="form-banner"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          {message}
        </p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Upload document"}
      </button>
      </fieldset>
    </form>
  );
}

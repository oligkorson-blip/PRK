"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadSignedContractDocument } from "@/lib/contracts/actions";

type ContractOption = {
  id: string;
  version: string;
  investorEmail: string;
};

export function SignedContractDocumentUploadForm({
  contracts,
  storageConfigured
}: {
  contracts: ContractOption[];
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const [contractId, setContractId] = useState(contracts[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const messageRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selected = contracts.find((contract) => contract.id === contractId) ?? null;

  useEffect(() => {
    if (pending) return;
    if (error) errorRef.current?.focus();
    else if (message) messageRef.current?.focus();
  }, [error, message, pending]);

  if (contracts.length === 0) {
    return <p className="lead">No effective agreements are waiting for signed copies.</p>;
  }

  return (
    <form
      className="form-card"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setError(null);
        setMessage(null);
        startTransition(async () => {
          try {
            const result = await uploadSignedContractDocument(new FormData(form));
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage("Signed copy published. The investor can now download it from their agreement.");
            form.reset();
            setContractId(contracts[0]?.id ?? "");
            router.refresh();
          } catch {
            setError("Could not publish the signed copy. Please try again.");
          }
        });
      }}
    >
      {!storageConfigured ? (
        <p className="form-error" role="alert">
          Document storage is not configured — set DOCUMENTS_DIR before publishing signed copies.
        </p>
      ) : null}
      <fieldset className="form-fieldset" disabled={!storageConfigured || pending}>
        <div className="form-field">
          <label htmlFor="signedContractId">Agreement</label>
          <select
            id="signedContractId"
            name="contractId"
            value={contractId}
            onChange={(event) => setContractId(event.target.value)}
            required
          >
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.investorEmail} · {contract.version}
              </option>
            ))}
          </select>
          <input type="hidden" name="contractVersion" value={selected?.version ?? ""} />
        </div>
        <div className="form-field">
          <label htmlFor="signedContractTitle">Title (optional)</label>
          <input id="signedContractTitle" name="title" maxLength={200} />
        </div>
        <div className="form-field">
          <label htmlFor="signedContractFile">Final signed PDF</label>
          <input
            id="signedContractFile"
            name="file"
            type="file"
            accept="application/pdf"
            required
          />
          <p className="field-hint">PDF only · up to 15MB · publish only after final signatures.</p>
        </div>
        {error ? (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p ref={messageRef} className="form-banner" role="status" aria-live="polite" tabIndex={-1}>
            {message}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Publishing…" : "Publish signed copy"}
        </button>
      </fieldset>
    </form>
  );
}

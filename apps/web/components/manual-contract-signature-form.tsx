"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordManualContractSignature } from "@/lib/contracts/actions";

type ManualSigner = {
  role: "investor" | "legal_signer";
  displayName: string;
  status: string;
};

const ROLE_LABEL: Record<ManualSigner["role"], string> = {
  investor: "Investor",
  legal_signer: "Park legal signer"
};

export function ManualContractSignatureForm({
  contractId,
  contractVersion,
  signers,
  signingClosed
}: {
  contractId: string;
  contractVersion: string;
  signers: ManualSigner[];
  signingClosed: boolean;
}) {
  const router = useRouter();
  const [signerRole, setSignerRole] = useState(
    signers.find((signer) => signer.status !== "signed")?.role ?? signers[0]?.role ?? "investor"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const messageRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending) return;
    if (error) errorRef.current?.focus();
    else if (message) messageRef.current?.focus();
  }, [error, message, pending]);

  const availableSigners = signers.filter((signer) => signer.status !== "signed");

  if (signingClosed || availableSigners.length === 0) {
    return (
      <p className="lead">
        {signingClosed
          ? "Manual signatures are closed for this agreement."
          : "All required signatures have been recorded."}
      </p>
    );
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
            const result = await recordManualContractSignature(new FormData(form));
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage(
              result.transitions.length > 0
                ? `Signature recorded. Lifecycle advanced to ${result.transitions.join(", ")}.`
                : "Signature recorded."
            );
            form.reset();
            router.refresh();
          } catch {
            setError("Could not record the manual signature. Please try again.");
          }
        });
      }}
    >
      <fieldset className="form-fieldset" disabled={pending}>
        <input type="hidden" name="contractId" value={contractId} />
        <input type="hidden" name="contractVersion" value={contractVersion} />
        <div className="form-field">
          <label htmlFor="manualSignerRole">Signer</label>
          <select
            id="manualSignerRole"
            name="signerRole"
            value={signerRole}
            onChange={(event) => setSignerRole(event.target.value as ManualSigner["role"])}
            required
          >
            {availableSigners.map((signer) => (
              <option key={signer.role} value={signer.role}>
                {ROLE_LABEL[signer.role]} · {signer.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="manualSignedAt">Signed at</label>
          <input id="manualSignedAt" name="signedAt" type="datetime-local" required />
          <p className="field-hint">Record the date and time shown on the manually signed agreement.</p>
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
          {pending ? "Recording…" : "Record manual signature"}
        </button>
      </fieldset>
    </form>
  );
}

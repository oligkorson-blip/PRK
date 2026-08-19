"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eraseInvestorAction } from "@/lib/privacy/actions";

/**
 * GDPR erasure (super_admin only — the server action re-checks). Anonymises
 * investor/lead PII and deletes KYC documents unless a legal hold is set.
 * Confirmed by typing the investor's email.
 */
export function InvestorErasureSection({
  investorId,
  investorEmail,
  alreadyErased
}: {
  investorId: string;
  investorEmail: string;
  alreadyErased: boolean;
}) {
  const router = useRouter();
  const [confirmEmail, setConfirmEmail] = useState("");
  const [legalHold, setLegalHold] = useState(false);
  const [legalHoldReason, setLegalHoldReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (alreadyErased || done) {
    return (
      <p className="field-hint">
        This investor has been erased. Personal data is anonymised; holdings and distributions
        are kept as legal records.
      </p>
    );
  }

  const confirmed = confirmEmail.trim().toLowerCase() === investorEmail.toLowerCase();
  const holdReady = !legalHold || legalHoldReason.trim().length > 0;

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await eraseInvestorAction({
          investorId,
          confirmEmail,
          legalHold,
          legalHoldReason
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDone(true);
        router.refresh();
      } catch {
        setError("The erasure could not be completed. Please try again.");
      }
    });
  }

  return (
    <div>
      <p className="field-hint" style={{ maxWidth: 560 }}>
        Anonymises personal data on the investor and the linked lead, and deletes their KYC
        document files. Holdings and distributions stay — they are legal records. Type the
        investor&apos;s email ({investorEmail}) to confirm.
      </p>
      <label className="form-field stack-4" style={{ display: "block", maxWidth: 420 }}>
        <span>Confirm email</span>
        <input
          type="text"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          disabled={isPending}
          placeholder="Type the investor's email to confirm"
          autoComplete="off"
        />
      </label>
      <label className="form-field stack-4" style={{ display: "block", maxWidth: 560 }}>
        <span>
          <input
            type="checkbox"
            checked={legalHold}
            onChange={(e) => setLegalHold(e.target.checked)}
            disabled={isPending}
            style={{ marginRight: 8 }}
          />
          Legal hold — keep KYC documents on file
        </span>
      </label>
      {legalHold ? (
        <label className="form-field stack-4" style={{ display: "block", maxWidth: 420 }}>
          <span>Legal hold reason (recorded in the audit log)</span>
          <input
            type="text"
            value={legalHoldReason}
            onChange={(e) => setLegalHoldReason(e.target.value)}
            disabled={isPending}
            placeholder="e.g. AML investigation #123"
            maxLength={500}
          />
        </label>
      ) : null}
      <div className="stack-2">
        <button
          type="button"
          className="btn btn-danger"
          disabled={!confirmed || !holdReady || isPending}
          onClick={run}
        >
          {isPending ? "Erasing…" : "Erase personal data"}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

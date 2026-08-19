"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetInvestorTwoFactor } from "@/lib/investors/two-factor-actions";

export function ResetInvestorTwoFactorButton({ investorId, email }: {
  investorId: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    if (!window.confirm(`Reset two-factor authentication and revoke all sessions for ${email}?`)) {
      return;
    }
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await resetInvestorTwoFactor({ investorId });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage("Two-factor access reset. The investor must enroll again.");
        router.refresh();
      } catch {
        setError("Two-factor access could not be reset. Please try again.");
      }
    });
  }

  return (
    <div>
      <button className="btn btn-danger" type="button" onClick={reset} disabled={pending}>
        {pending ? "Resetting…" : "Reset two-factor access"}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="field-hint" role="status" aria-live="polite">{message}</p> : null}
    </div>
  );
}

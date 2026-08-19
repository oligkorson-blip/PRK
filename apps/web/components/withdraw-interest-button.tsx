"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawInterest } from "@/lib/interests/actions";
import {
  PORTAL_WITHDRAWAL_CONFIRMATION,
  PORTAL_WITHDRAWAL_ERROR
} from "@/lib/copy/consumer";

export function WithdrawInterestButton({ interestId }: { interestId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const keepRequestRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (confirming) {
      keepRequestRef.current?.focus();
    }
  }, [confirming]);

  useEffect(() => {
    if (isPending || !error) return;
    errorRef.current?.focus();
  }, [error, isPending]);

  function handleWithdraw() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await withdrawInterest({ interestId });
        if (result.ok) {
          setConfirming(false);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError(PORTAL_WITHDRAWAL_ERROR);
      }
    });
  }

  return (
    <div className="withdraw-interest">
      {confirming ? (
        <div role="group" aria-label="Confirm withdrawal">
          <p className="field-hint">{PORTAL_WITHDRAWAL_CONFIRMATION}</p>
          <button
            ref={keepRequestRef}
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
          >
            Keep request
          </button>{" "}
          <button
            className="btn btn-danger btn-sm"
            type="button"
            onClick={handleWithdraw}
            disabled={isPending}
          >
            {isPending ? "Withdrawing…" : "Confirm withdrawal"}
          </button>
        </div>
      ) : (
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => setConfirming(true)}
          disabled={isPending}
        >
          Withdraw
        </button>
      )}
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
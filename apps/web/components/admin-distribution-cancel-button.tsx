"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelDistribution } from "@/lib/portfolio/admin-distributions";

export function AdminDistributionCancelButton({ distributionId }: { distributionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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

  function handleCancel() {
    if (
      !window.confirm("Cancel this recorded distribution? The investor will not be notified.")
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await cancelDistribution({ distributionId });
        if (result.ok) {
          setNotice(
            result.pendingSecondApproval
              ? "First approval recorded — a second super admin must approve the cancellation."
              : "Distribution cancelled."
          );
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The distribution could not be cancelled. Please try again.");
      }
    });
  }

  return (
    <>
      <button
        className="btn btn-danger btn-sm"
        type="button"
        onClick={handleCancel}
        disabled={isPending}
      >
        {isPending ? "Cancelling…" : "Cancel"}
      </button>
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
    </>
  );
}

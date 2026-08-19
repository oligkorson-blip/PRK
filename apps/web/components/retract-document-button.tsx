"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retractDocument } from "@/lib/documents/actions";

export function RetractDocumentButton({ documentId, title }: { documentId: string; title: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending || !error) return;
    errorRef.current?.focus();
  }, [error, isPending]);

  function handleRetract() {
    if (
      !window.confirm(
        `Retract "${title}"? Investors immediately lose access. The file stays in storage for audit.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await retractDocument({ documentId });
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The document could not be retracted. Please try again.");
      }
    });
  }

  return (
    <>
      <button
        className="btn btn-danger btn-sm"
        type="button"
        onClick={handleRetract}
        disabled={isPending}
      >
        {isPending ? "Retracting…" : "Retract"}
      </button>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
    </>
  );
}

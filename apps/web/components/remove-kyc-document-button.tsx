"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { removeKycDocument } from "@/lib/kyc/actions";

export function RemoveKycDocumentButton({ documentId, title }: { documentId: string; title: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isPending || !error) return;
    errorRef.current?.focus();
  }, [error, isPending]);

  function handleRemove() {
    if (!window.confirm("Change this file so you can upload a replacement?")) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await removeKycDocument(documentId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.location.reload();
      } catch {
        setError("The file could not be removed. Please try again.");
      }
    });
  }

  return (
    <span className="document-remove-action">
      <button
        type="button"
        className="link-arrow"
        onClick={handleRemove}
        disabled={isPending}
        aria-label={`Change ${title}`}
      >
        {isPending ? "Changing…" : "Change"}
      </button>
      {error ? (
        <span ref={errorRef} className="field-error" role="alert" tabIndex={-1}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
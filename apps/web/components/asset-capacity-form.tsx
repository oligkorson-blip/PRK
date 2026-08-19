"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAssetCapacity } from "@/lib/assets/admin-actions";

export function AssetCapacityForm({
  assetId,
  advisoryCapacityEur
}: {
  assetId: string;
  advisoryCapacityEur: number | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (message) {
      messageRef.current?.focus();
    }
  }, [error, isPending, message]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await updateAssetCapacity({
          assetId,
          advisoryCapacityEur: String(fd.get("advisoryCapacityEur") ?? "")
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage("Capacity saved.");
        router.refresh();
      } catch {
        setError("The capacity could not be saved. Please try again.");
      }
    });
  }

  return (
    <form className="asset-image-form" onSubmit={handleSubmit} aria-busy={isPending}>
      <fieldset className="form-fieldset" disabled={isPending}>
        <legend className="sr-only">Asset capacity</legend>
        <label className="form-field">
          <span>Advisory capacity (€)</span>
          <input
            name="advisoryCapacityEur"
            type="text"
            inputMode="numeric"
            defaultValue={advisoryCapacityEur ?? ""}
            placeholder="e.g. 1500000"
            disabled={isPending}
          />
        </label>
        <p className="field-hint">Used for funding % on the consumer site. Blank clears.</p>
        {error ? (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p
            ref={messageRef}
            className="field-hint"
            role="status"
            aria-live="polite"
            tabIndex={-1}
          >
            {message}
          </p>
        ) : null}
        <button className="btn btn-ghost btn-sm" type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save capacity"}
        </button>
      </fieldset>
    </form>
  );
}

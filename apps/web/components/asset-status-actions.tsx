"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAssetStatus, type AssetStatus } from "@/lib/assets/admin-actions";
import { OPERATIONS_OPPORTUNITY_UPDATE_ERROR } from "@/lib/copy/operations";

function statusSuccessMessage(next: AssetStatus): string {
  if (next === "published") return "Opportunity published.";
  if (next === "draft") return "Opportunity unpublished.";
  return "Opportunity closed to new investments.";
}

export function AssetStatusActions({
  assetId,
  name,
  status
}: {
  assetId: string;
  name: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (message) {
      messageRef.current?.focus();
    }
  }, [error, message, pending]);

  function run(next: AssetStatus) {
    setError(null);
    setMessage(null);
    start(async () => {
      try {
        const result = await setAssetStatus({ assetId, status: next });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(statusSuccessMessage(next));
        router.refresh();
      } catch {
        setError(OPERATIONS_OPPORTUNITY_UPDATE_ERROR);
      }
    });
  }

  function handleUnpublish() {
    if (!window.confirm(`Unpublish '${name}'? It disappears from the public site.`)) return;
    run("draft");
  }

  function handleClose() {
    if (!window.confirm(`Close '${name}' to new investments?`)) return;
    run("closed");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {status !== "published" ? (
          <button className="btn btn-sm btn-primary" type="button" disabled={pending} onClick={() => run("published")}>
            Publish
          </button>
        ) : null}
        {status !== "draft" ? (
          <button className="btn btn-sm btn-danger" type="button" disabled={pending} onClick={handleUnpublish}>
            Unpublish
          </button>
        ) : null}
        {status === "published" ? (
          <button className="btn btn-sm btn-danger" type="button" disabled={pending} onClick={handleClose}>
            Close
          </button>
        ) : null}
      </div>
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
    </div>
  );
}

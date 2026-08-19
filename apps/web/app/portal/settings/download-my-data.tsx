"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { exportMyData } from "@/lib/privacy/actions";
import { formatDateDdMmYyyy } from "@/lib/format";

/** Self-serve GDPR export: fetches the JSON document and saves it as a file. */
export function DownloadMyDataButton() {
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
  }, [isPending, error, message]);

  function run() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await exportMyData();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: "application/json"
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `parkwise-data-export-${formatDateDdMmYyyy(new Date())}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setMessage("Your data export is ready.");
      } catch {
        setError("Your data export could not be prepared. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="stack-4">
      <button type="button" className="btn btn-primary" disabled={isPending} onClick={run}>
        {isPending ? "Preparing…" : "Download my data"}
      </button>
      {message ? (
        <p ref={messageRef} className="field-hint" role="status" aria-live="polite" tabIndex={-1}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

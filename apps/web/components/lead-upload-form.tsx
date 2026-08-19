"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadLeadsCsv } from "@/lib/leads/admin-actions";
import type { UploadLeadsResult } from "@/lib/leads/admin-actions";
import type { ParseLeadsCsvError } from "@/lib/leads/csv";

export function LeadUploadForm({ listId }: { listId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<ParseLeadsCsvError[]>([]);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (imported !== null) {
      messageRef.current?.focus();
    }
  }, [error, imported, isPending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setError("Choose a CSV file.");
      return;
    }

    setError(null);
    setImported(null);
    setSkipped(null);
    setRowErrors([]);

    startTransition(async () => {
      try {
        const csvText = await file.text();
        const result: UploadLeadsResult = await uploadLeadsCsv({ listId, csvText });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setImported(result.imported);
        setSkipped(result.skipped);
        setRowErrors(result.errors);
        form.reset();
        router.refresh();
      } catch {
        setError("The CSV could not be uploaded. Please try again.");
      }
    });
  }

  return (
    <form className="onboarding-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>CSV file</span>
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          disabled={isPending}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Uploading…" : "Upload CSV"}
      </button>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {imported !== null ? (
        <p
          ref={messageRef}
          className="lead"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          Imported {imported} lead{imported === 1 ? "" : "s"}.
          {skipped
            ? ` Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"} (email already in this list).`
            : null}
        </p>
      ) : null}
      {rowErrors.length > 0 ? (
        <div>
          <p className="lead">Row errors ({rowErrors.length}):</p>
          <ul>
            {rowErrors.map((rowError) => (
              <li key={`${rowError.line}:${rowError.message}`}>
                Line {rowError.line}: {rowError.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

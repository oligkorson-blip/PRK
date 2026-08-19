"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { logCallAttempt } from "@/lib/leads/call-actions";
import {
  LEAD_CALL_OUTCOMES,
  leadCallOutcomeLabel
} from "@/lib/leads/outcomes";

export function LogCallForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<(typeof LEAD_CALL_OUTCOMES)[number]>(
    "no_answer"
  );
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await logCallAttempt({
          leadId,
          outcome,
          notes: notes.trim() === "" ? null : notes,
          followUpAt: followUp === "" ? undefined : new Date(followUp).toISOString()
        });
        if (result.ok) {
          setNotes("");
          setOutcome("no_answer");
          setFollowUp("");
          setMessage("Call logged.");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The call could not be logged. Please try again.");
      }
    });
  }

  return (
    <form className="log-call-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Outcome</span>
        <select
          name="outcome"
          aria-label="Call outcome"
          value={outcome}
          disabled={isPending}
          onChange={(event) =>
            setOutcome(event.target.value as (typeof LEAD_CALL_OUTCOMES)[number])
          }
          required
        >
          {LEAD_CALL_OUTCOMES.map((value) => (
            <option key={value} value={value}>
              {leadCallOutcomeLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Next follow-up (optional)</span>
        <input
          type="datetime-local"
          name="followUp"
          aria-label="Next follow-up"
          value={followUp}
          disabled={isPending}
          onChange={(event) => setFollowUp(event.target.value)}
        />
      </label>
      <label className="form-field form-field-wide">
        <span>Notes</span>
        <textarea
          name="notes"
          aria-label="Call notes"
          value={notes}
          disabled={isPending}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Optional notes from the call"
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Logging…" : "Log call"}
      </button>
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
    </form>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setLeadFollowUp } from "@/lib/leads/assign/status";

function toLocalInputValue(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LeadFollowUpForm({
  leadId,
  nextFollowUpAt
}: {
  leadId: string;
  nextFollowUpAt: Date | null;
}) {
  const router = useRouter();
  const [followUp, setFollowUp] = useState(toLocalInputValue(nextFollowUpAt));
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

  function handleFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setLeadFollowUp({
          leadId,
          nextFollowUpAt: followUp === "" ? null : new Date(followUp).toISOString()
        });
        if (result.ok) {
          setMessage("Follow-up saved.");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The follow-up could not be saved. Please try again.");
      }
    });
  }

  return (
    <form className="lead-followup" onSubmit={handleFollowUp}>
      <label className="form-field">
        <span>Next follow-up</span>
        <input
          type="datetime-local"
          value={followUp}
          disabled={isPending}
          onChange={(event) => setFollowUp(event.target.value)}
        />
      </label>
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
      <button type="submit" className="btn btn-ghost btn-sm" disabled={isPending}>
        Save follow-up
      </button>
    </form>
  );
}

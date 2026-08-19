"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setLeadStatus } from "@/lib/leads/assign/status";
import {
  LEAD_STAGE_PILL_VARIANT,
  LEAD_STATUS_LABEL,
  SETTABLE_LEAD_STATUSES,
  type LeadStatus
} from "@/lib/leads/labels";

/**
 * Pill-styled inline stage control (HubSpot-style). Converted leads render a
 * static pill — the converted guard in setLeadStatus locks them server-side.
 */
export function LeadStageSelect({
  leadId,
  status,
  label = "Lead stage"
}: {
  leadId: string;
  status: string;
  label?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLSpanElement>(null);
  const messageRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (message) {
      messageRef.current?.focus();
    }
  }, [error, isPending, message]);

  if (status === "converted") {
    return <span className="stage-pill stage-pill-converted">Converted</span>;
  }

  function handleChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setLeadStatus({ leadId, status: next });
        if (result.ok) {
          setMessage("Stage updated.");
          router.refresh();
        } else {
          setValue(previous);
          setError(result.error);
        }
      } catch {
        setValue(previous);
        setError("The lead stage could not be updated. Please try again.");
      }
    });
  }

  const variant =
    LEAD_STAGE_PILL_VARIANT[value as LeadStatus] ?? "stage-pill-muted";

  return (
    // stopPropagation: inside clickable table rows this must not navigate.
    <span className="stage-select-wrap" onClick={(event) => event.stopPropagation()}>
      <select
        className={`stage-pill stage-select ${variant}`}
        value={value}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
        aria-label={label}
      >
        {SETTABLE_LEAD_STATUSES.map((option) => (
          <option key={option} value={option}>
            {LEAD_STATUS_LABEL[option]}
          </option>
        ))}
      </select>
      {error ? (
        <span ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </span>
      ) : null}
      {message ? (
        <span
          ref={messageRef}
          className="field-hint"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          {message}
        </span>
      ) : null}
    </span>
  );
}

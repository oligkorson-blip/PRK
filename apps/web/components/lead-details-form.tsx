"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { updateLeadDetails } from "@/lib/leads/assign/details";

export function LeadDetailsForm({
  leadId,
  fullName,
  email,
  phone,
  notes
}: {
  leadId: string;
  fullName: string;
  email: string;
  phone: string | null;
  notes: string | null;
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await updateLeadDetails({
          leadId,
          fullName: String(data.get("fullName") ?? ""),
          email: String(data.get("email") ?? ""),
          phone: String(data.get("phone") ?? ""),
          notes: String(data.get("notes") ?? "")
        });
        if (result.ok) {
          setMessage("Lead details saved.");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The lead details could not be saved. Please try again.");
      }
    });
  }

  return (
    <form className="lead-details-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Name</span>
        <input name="fullName" required minLength={2} maxLength={200} defaultValue={fullName} />
      </label>
      <label className="form-field">
        <span>Email</span>
        <input name="email" type="email" required maxLength={320} defaultValue={email} />
      </label>
      <label className="form-field">
        <span>Phone</span>
        <input name="phone" type="tel" maxLength={40} defaultValue={phone ?? ""} />
      </label>
      <label className="form-field">
        <span>Notes</span>
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={notes ?? ""} />
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
      <button type="submit" className="btn btn-primary btn-sm" disabled={isPending}>
        {isPending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}

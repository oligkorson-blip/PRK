"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addInvestorNote } from "@/lib/investors/note-actions";

export function AdminInvestorNoteForm({ investorId }: { investorId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
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
    startTransition(async () => {
      try {
        const result = await addInvestorNote({ investorId, body });
        if (result.ok) {
          setBody("");
          setMessage("Note saved.");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The note could not be saved. Please try again.");
      }
    });
  }

  return (
    <form className="admin-investor-note-form" onSubmit={handleSubmit}>
      <label>
        Add a note
        <textarea
          name="body"
          rows={3}
          value={body}
          maxLength={2000}
          disabled={isPending}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What happened? Calls, promises, context…"
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
      <button type="submit" className="btn btn-primary btn-sm" disabled={isPending}>
        {isPending ? "Saving…" : "Save note"}
      </button>
    </form>
  );
}

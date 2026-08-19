"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { authClient } from "@/lib/auth/client";

export function RevokeOtherSessionsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (message) {
      messageRef.current?.focus();
    }
  }, [pending, error, message]);

  function revoke() {
    if (!window.confirm("Sign out every other session on this account?")) {
      return;
    }
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await authClient.revokeOtherSessions();
        if (result.error) {
          setError("Could not sign out other sessions. Try again.");
          return;
        }
        setMessage("All other sessions have been signed out.");
      } catch {
        setError("Could not sign out other sessions. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="stack-4">
      <button className="btn btn-ghost" type="button" onClick={revoke} disabled={pending}>
        {pending ? "Signing out…" : "Sign out other sessions"}
      </button>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p ref={messageRef} className="field-hint" role="status" aria-live="polite" tabIndex={-1}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

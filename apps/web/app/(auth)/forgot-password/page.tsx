"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { FORGOT_PASSWORD_ERROR, requestPasswordResetSafely } from "@/lib/auth/forgot-password";

export default function ForgotPasswordPage() {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const submittedRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (pending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (submitted) {
      submittedRef.current?.focus();
    }
  }, [pending, error, submitted]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    try {
      const result = await requestPasswordResetSafely(() =>
        authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`
        })
      );
      if (!result.sent) {
        setError(result.error);
        return;
      }
      // Always show the same response to avoid disclosing registered emails or
      // mail-delivery state to an unauthenticated caller.
      setSubmitted(true);
    } catch {
      setError(FORGOT_PASSWORD_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="portal-card">
      <div className="portal-head">
        <span className="brand-mark" aria-hidden="true">P</span>
        <span>Account recovery</span>
      </div>
      <h1>Reset your password</h1>
      {submitted ? (
        <p ref={submittedRef} role="status" tabIndex={-1}>
          If that email has a Parkwise account, a reset link is on its way. It expires in 60
          minutes. If it does not arrive, email contact@parkwise.eu.
        </p>
      ) : (
        <form className="interest-form" onSubmit={submit}>
          <label className="form-field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          {error ? (
            <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
              {error}
            </p>
          ) : null}
          <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="portal-meta"><Link href="/sign-in">Back to sign in</Link></p>
    </div>
  );
}

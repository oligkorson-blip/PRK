"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { RESET_PASSWORD_CONNECTION_ERROR } from "@/lib/auth/connection-copy";
import {
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH
} from "@/lib/auth/password-policy";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const invalid = searchParams.get("error") === "INVALID_TOKEN" || !token;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const invalidErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (invalid) {
      invalidErrorRef.current?.focus();
    } else if (!pending && error) {
      errorRef.current?.focus();
    }
  }, [invalid, pending, error]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError("This reset link is invalid or expired. Request a new one.");
        return;
      }
      router.push("/sign-in?reset=1");
    } catch {
      setError(RESET_PASSWORD_CONNECTION_ERROR);
    } finally {
      setPending(false);
    }
  }

  if (invalid) {
    return (
      <>
        <p ref={invalidErrorRef} role="alert" tabIndex={-1}>
          This reset link is invalid or expired.
        </p>
        <p className="portal-meta">
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </>
    );
  }

  return (
    <form className="interest-form" onSubmit={submit}>
      <label className="form-field">
        <span>New password</span>
        <input
          name="password"
          type="password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          required
        />
        <span className="field-hint">{PASSWORD_HINT}</span>
      </label>
      <label className="form-field">
        <span>Confirm password</span>
        <input
          name="confirmation"
          type="password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          required
        />
      </label>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="portal-card">
      <div className="portal-head">
        <span className="brand-mark" aria-hidden="true">P</span>
        <span>Account recovery</span>
      </div>
      <h1>Choose a new password</h1>
      <Suspense fallback={<p>Loading…</p>}><ResetPasswordForm /></Suspense>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { setPasswordWithInvite } from "@/lib/apply/set-password";
import { authClient } from "@/lib/auth/client";
import { SET_PASSWORD_CONNECTION_ERROR } from "@/lib/auth/connection-copy";
import {
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH
} from "@/lib/auth/password-policy";

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const missingTokenRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!token) {
      missingTokenRef.current?.focus();
    } else if (!isPending && error) {
      errorRef.current?.focus();
    }
  }, [token, isPending, error]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await setPasswordWithInvite({ token, password });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        let signIn;
        try {
          signIn = await authClient.signIn.email({ email: result.email, password });
        } catch {
          // Password is saved; fall back to the manual sign-in page.
          router.push("/sign-in?set=1");
          return;
        }
        if (signIn.error) {
          // Password is saved; fall back to the manual sign-in page.
          router.push("/sign-in?set=1");
          return;
        }
        // /portal routes to /onboarding when onboarding is incomplete.
        router.push("/portal");
        router.refresh();
      } catch {
        setError(SET_PASSWORD_CONNECTION_ERROR);
      }
    });
  }

  if (!token) {
    return (
      <>
        <p ref={missingTokenRef} className="form-error" role="alert" tabIndex={-1}>
          Missing invite token. Ask your advisor for a new invite.
        </p>
        <p className="portal-meta">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </>
    );
  }

  return (
    <form className="interest-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>New password</span>
        <input
          name="password"
          type="password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          required
          autoComplete="new-password"
        />
        <span className="field-hint">{PASSWORD_HINT}</span>
      </label>
      <label className="form-field">
        <span>Confirm password</span>
        <input
          name="confirm"
          type="password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          required
          autoComplete="new-password"
        />
      </label>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Set password"}
      </button>
      <p className="portal-meta">
        Already set? <Link href="/sign-in">Sign in</Link>
      </p>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <div className="portal-card">
      <div className="portal-head">
        <span className="brand-mark" aria-hidden="true">
          P
        </span>
        <span>Parkwise account</span>
      </div>
      <h1>Set your password</h1>
      <p>Welcome — choose a password to access the investor portal.</p>
      <Suspense fallback={<p>Loading…</p>}>
        <SetPasswordForm />
      </Suspense>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { SIGN_UP_CONNECTION_ERROR } from "@/lib/auth/connection-copy";
import {
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH
} from "@/lib/auth/password-policy";

const BOOTSTRAP_HINT =
  "Bootstrap signup is limited to emails listed in SUPER_ADMIN_EMAILS. Public investors should apply at /apply.";

// Generic fallback mirroring lib/auth/sign-in-errors.ts: better-auth error
// strings are internal and must never reach the UI verbatim.
const SIGN_UP_ERROR_FALLBACK = "We couldn’t create your account. Check your details and try again, or contact the team.";

/** Exported for tests — maps a raw better-auth signup error to safe copy. */
export function signUpErrorMessage(message: string | undefined): string {
  const msg = message ?? "";
  return /SUPER_ADMIN_EMAILS|Bootstrap signup/i.test(msg) ? BOOTSTRAP_HINT : SIGN_UP_ERROR_FALLBACK;
}

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending || !error) return;
    errorRef.current?.focus();
  }, [error, isPending]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const result = await authClient.signUp.email({ name, email, password });

      if (result.error) {
        setError(signUpErrorMessage(result.error.message));
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError(SIGN_UP_CONNECTION_ERROR);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <h1 className="display-s">Create ops account</h1>
      <p className="lead">
        Bootstrap only — use an email listed in <code>SUPER_ADMIN_EMAILS</code>, then unset{" "}
        <code>ALLOW_BOOTSTRAP_SIGNUP</code>.
      </p>
      <form className="interest-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Full name</span>
          <input name="name" type="text" autoComplete="name" required minLength={2} />
        </label>
        <label className="form-field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="form-field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
          />
          <span className="field-hint">{PASSWORD_HINT}</span>
        </label>

        {error ? (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}

        <button className="btn btn-primary btn-block" type="submit" disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="field-hint">
        Already registered? <Link href="/sign-in">Sign in</Link>
      </p>
    </>
  );
}

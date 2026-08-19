"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { resolvePostSignInDestination } from "@/lib/auth/post-sign-in-actions";
import { SIGN_IN_CONNECTION_ERROR } from "@/lib/auth/connection-copy";
import { resolveSignInErrorMessage } from "@/lib/apply/sign-in-hint";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSet = searchParams.get("set") === "1";
  const justReset = searchParams.get("reset") === "1";
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending || !error) return;
    errorRef.current?.focus();
  }, [isPending, error]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const result = await authClient.signIn.email({ email, password });

      if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
        // Prefer an explicit navigation: relying only on twoFactorClient's
        // window.location hook can leave the form idle if the plugin hook races.
        window.location.assign("/two-factor");
        return;
      }

      if (result.error) {
        setError(await resolveSignInErrorMessage(email, result.error));
        return;
      }

      router.push(await resolvePostSignInDestination());
    } catch {
      setError(SIGN_IN_CONNECTION_ERROR);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      {justSet ? (
        <p className="field-hint" role="status">
          Password saved. Sign in to continue to your dashboard.
        </p>
      ) : null}
      {justReset ? (
        <p className="field-hint" role="status">
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      <form className="interest-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="form-field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>

        {error ? (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}

        <button className="btn btn-primary btn-block" type="submit" disabled={isPending}>
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="portal-meta">
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
      <p className="portal-meta">
        Need access? <Link href="/apply">Request access</Link>
      </p>
    </>
  );
}

export default function SignInPage() {
  return (
    <div className="portal-card">
      <div className="portal-head">
        <span className="brand-mark" aria-hidden="true">
          P
        </span>
        <span>Parkwise account</span>
      </div>
      <h1>Sign in.</h1>
      <p>For applicants who have already received an invitation.</p>
      <Suspense fallback={<p>Loading…</p>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
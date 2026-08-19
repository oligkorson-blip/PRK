"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AuthError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="auth-page">
      <section className="auth-card" role="alert">
        <p className="kicker">Account access</p>
        <h1 className="h2">We couldn&apos;t finish that just now</h1>
        <p className="lead">
          Nothing has changed on your account. Try again, or return to sign in if you still need help.
        </p>
        <div className="apply-actions">
          <button className="btn btn-primary" type="button" onClick={reset}>
            Try again
          </button>
          <Link className="btn btn-ghost" href="/sign-in">
            Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

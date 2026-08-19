"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:error]", error);
  }, [error]);

  return (
    <main>
      <section className="page-hero" aria-labelledby="app-error-title" aria-describedby="app-error-description">
        <div className="container" style={{ maxWidth: 720 }}>
          <span className="kicker">Something went wrong</span>
          <h1 id="app-error-title" className="display-l">We hit a temporary problem.</h1>
          <p id="app-error-description" className="lead">
            Please try again. If it keeps happening, contact the team and we will look into it.
          </p>
          <div className="hero-ctas stack-7">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Try again
            </button>
            <Link className="btn btn-ghost-light" href="/">
              Back to home <span className="arrow">→</span>
            </Link>
            <Link className="btn btn-ghost-light" href="/contact">
              Talk to the team
            </Link>
          </div>
          {error.digest ? (
            <p className="field-hint stack-5">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

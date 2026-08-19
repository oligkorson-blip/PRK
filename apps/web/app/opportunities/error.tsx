"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[opportunities:error]", error);
  }, [error]);

  return (
    <main>
      <section className="page-hero">
        <div className="container" style={{ maxWidth: 720 }}>
          <span className="kicker">Something went wrong</span>
          <h1 className="display-l">We couldn&apos;t load opportunities.</h1>
          <p className="lead">
            Please try again. If it keeps happening, contact the team and we will look into it.
          </p>
          <div className="hero-ctas stack-7">
            <button type="button" className="btn btn-primary" onClick={reset}>
              Try again
            </button>
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

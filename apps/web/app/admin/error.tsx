"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin:error]", error);
  }, [error]);

  return (
    <div className="admin-page">
      <span className="admin-hub-k">Something went wrong</span>
      <h1 className="display-s stack-4">We couldn&apos;t load this admin page.</h1>
      <p className="lead">
        Please try again. If it keeps happening, contact the team and we will look into it.
      </p>
      <div className="stack-5">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      </div>
      {error.digest ? <p className="field-hint stack-5">Reference: {error.digest}</p> : null}
    </div>
  );
}

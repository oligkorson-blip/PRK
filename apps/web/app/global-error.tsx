"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          role="alert"
          aria-labelledby="global-error-title"
          aria-describedby="global-error-description"
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "4rem 1.5rem",
            fontFamily: "system-ui, sans-serif"
          }}
        >
          <p>Something went wrong</p>
          <h1 id="global-error-title">We hit a temporary problem.</h1>
          <p id="global-error-description">
            Please try again. If the problem continues, contact the team.
          </p>
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
          {error.digest ? <p>Reference: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}

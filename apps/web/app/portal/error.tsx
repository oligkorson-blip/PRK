"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PortalError({
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
    <main className="dash-content">
      <section className="section-tight">
        <div className="dash-panel">
          <p className="detail-section-kicker">Investor portal</p>
          <h1 className="display-m">We couldn’t load this just now</h1>
          <p className="lead">
            Your account is safe. Try again, return to the dashboard, or contact support if the problem continues.
          </p>
          <div className="apply-actions">
            <button className="btn btn-primary" type="button" onClick={reset}>
              Try again
            </button>
            <Link className="btn btn-ghost" href="/portal">
              Dashboard
            </Link>
            <Link className="btn btn-ghost" href="/contact">
              Support
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

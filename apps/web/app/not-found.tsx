import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page is not available. Browse Parkwise parking investment opportunities instead."
};

export default function NotFound() {
  return (
    <main>
      <section className="page-hero" aria-labelledby="not-found-title" aria-describedby="not-found-description">
        <div className="container container-narrow">
          <span className="kicker">404</span>
          <h1 id="not-found-title" className="display-l">This page is not on the map.</h1>
          <p id="not-found-description" className="lead">
            The link may be old, or the page moved. You can still request access to the
            catalogue or return home.
          </p>
          <div className="hero-ctas stack-7">
            <Link className="btn btn-primary" href="/apply">
              Request access <span className="arrow">→</span>
            </Link>
            <Link className="btn btn-ghost-light" href="/">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

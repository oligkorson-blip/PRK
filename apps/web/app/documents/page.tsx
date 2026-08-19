import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Documents",
  description:
    "Read Parkwise terms, risk disclosure, fees, and privacy information before you invest."
};

const docIcon = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </svg>
);

export default async function DocumentsPage() {
  const session = await getSessionUser();

  return (
    <main>
      <PageIntro
        variant="functional"
        kicker="Documents"
        title="Documents and disclosures."
        lead="Please review terms, risk information, and deal documents before you allocate. Further materials also appear on each opportunity page."
      />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Your documents</span>
            <h2 className="display-m">Public pages and your document library</h2>
            <p className="lead">
              Legal pages below are open to everyone. Once you're approved, your dashboard holds
              opportunity documents and statements tied to your investments.
            </p>
          </div>

          {session ? (
            <p>
              <Link className="link-arrow" href="/portal/documents">
                Open your document vault →
              </Link>
            </p>
          ) : (
            <div className="portal-banner" role="status">
              <p>
                Your account documents appear once you're approved and signed in.{" "}
                <Link className="link-arrow" href="/apply">
                  Request access
                </Link>{" "}
                or{" "}
                <Link className="link-arrow" href="/sign-in">
                  sign in
                </Link>
                .
              </p>
            </div>
          )}

          <div className="section-head stack-8">
            <span className="kicker">Legal</span>
            <h2 className="display-s">Public documents</h2>
          </div>
          <div className="doc-groups">
            <div>
              <h3 className="h4">Platform</h3>
              <div className="grid-2">
                <Link className="doc-card" href="/legal/terms">
                  <span className="doc-icon">{docIcon}</span>
                  <span className="doc-meta">
                    <b>Platform terms</b>
                    <span>How the investor platform works</span>
                  </span>
                </Link>
                <Link className="doc-card" href="/legal/privacy">
                  <span className="doc-icon">{docIcon}</span>
                  <span className="doc-meta">
                    <b>Privacy notice</b>
                    <span>How we process personal data</span>
                  </span>
                </Link>
              </div>
            </div>
            <div>
              <h3 className="h4">Risk, fees & complaints</h3>
              <div className="grid-3">
                <Link className="doc-card" href="/legal/risk">
                  <span className="doc-icon">{docIcon}</span>
                  <span className="doc-meta">
                    <b>Risk disclosure</b>
                    <span>Capital at risk and key warnings</span>
                  </span>
                </Link>
                <Link className="doc-card" href="/fees">
                  <span className="doc-icon">{docIcon}</span>
                  <span className="doc-meta">
                    <b>Fees</b>
                    <span>How fees can affect returns</span>
                  </span>
                </Link>
                <Link className="doc-card" href="/legal/complaints">
                  <span className="doc-icon">{docIcon}</span>
                  <span className="doc-meta">
                    <b>Complaints</b>
                    <span>How to raise and escalate a complaint</span>
                  </span>
                </Link>
              </div>
            </div>
            <div>
              <h3 className="h4">Cookies</h3>
              <div className="grid-2">
                <Link className="doc-card" href="/legal/cookies">
                  <span className="doc-icon">{docIcon}</span>
                  <span className="doc-meta">
                    <b>Cookie notice</b>
                    <span>Necessary cookies for auth and security</span>
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-band section">
        <div className="container">
          <div className="cta-grid">
            <div>
              <h2 className="display-m">Still have questions?</h2>
              <p className="lead cta-lead">
                Talk to the team, or browse opportunities while you read the documents.
              </p>
              <div className="apply-actions">
                <Link className="btn btn-white" href="/contact">
                  Talk to the team <span className="arrow">→</span>
                </Link>
                <Link className="btn btn-ghost-light" href="/apply">
                  Apply to view opportunities <span className="arrow">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

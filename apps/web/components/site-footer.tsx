import Link from "next/link";
import { FOOTER_BLURB, RISK_LINE } from "@/lib/copy/consumer";
import { POSTURE_LINE } from "@/lib/copy/posture";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid footer-grid-3">
          <div className="footer-brand">
            <Link className="brand" href="/" aria-label="Parkwise home">
              <span className="brand-mark">P</span>
              <span className="brand-name">Parkwise</span>
            </Link>
            <p>{FOOTER_BLURB}</p>
          </div>
          <div className="footer-col">
            <h2>Explore</h2>
            <ul>
              <li>
                <Link href="/how-it-works">How it works</Link>
              </li>
              <li>
                <Link href="/why-parking">Why parking</Link>
              </li>
              <li>
                <Link href="/guides">Guides</Link>
              </li>
              <li>
                <Link href="/faq">FAQ</Link>
              </li>
              <li>
                <Link href="/apply">Request access</Link>
              </li>
              <li>
                <Link href="/sign-in">Sign in</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h2>Company &amp; support</h2>
            <ul>
              <li>
                <Link href="/about">About</Link>
              </li>
              <li>
                <Link href="/contact">Contact</Link>
              </li>
              <li>
                <Link href="/documents">Documents</Link>
              </li>
              <li>
                <Link href="/fees">Fees</Link>
              </li>
              <li>
                <Link href="/legal/complaints">Complaints</Link>
              </li>
              <li>
                <a href="mailto:contact@parkwise.eu">contact@parkwise.eu</a>
              </li>
              <li>
                <a className="contact-strong" href="tel:+35316994240">
                  +353 1 699 42 40
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h2>Legal</h2>
            <ul>
              <li>
                <Link href="/legal/risk">Risk disclosure</Link>
              </li>
              <li>
                <Link href="/legal/terms">Terms</Link>
              </li>
              <li>
                <Link href="/legal/privacy">Privacy</Link>
              </li>
              <li>
                <Link href="/legal/cookies">Cookies</Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="footer-risk">
        <div className="container">
          <p>
            <strong>{RISK_LINE}</strong>{" "}
            <Link href="/legal/risk">Read the full risk disclosure →</Link>
          </p>
          <p className="footer-posture">
            {POSTURE_LINE}{" "}
            <span className="footer-legal-links">
              <Link href="/legal/terms">Terms</Link>
              <span aria-hidden="true">{" · "}</span>
              <Link href="/legal/risk">Risk</Link>
            </span>
          </p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Parkwise. All rights reserved.</span>
        <span>Investor platform · Ireland</span>
      </div>
    </footer>
  );
}

import type { Metadata } from "next";
import { DemoBanner } from "@/components/demo-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeaderHost } from "@/components/site-header-host";
import { SiteFooterGate } from "@/components/site-footer-gate";
import { SiteHeaderGate } from "@/components/site-header-gate";
import "./globals.css";

// The nonce-based CSP (middleware.ts) requires per-request rendering: pages
// prerendered at build time would ship framework scripts without the request's
// nonce and be blocked by script-src. Force dynamic rendering app-wide.
//
// Known trade-off: this makes static marketing pages render per request too.
// Acceptable at current traffic; if it becomes a problem, revisit by moving
// static routes to a hash-based script-src (no nonce, prerender allowed) while
// keeping the nonce CSP for authed areas — do not weaken script-src to do so.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(
    (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")
  ),
  title: {
    default: "Parkwise | Invest in parking assets",
    template: "%s | Parkwise"
  },
  description:
    "They park. You earn. Parking near the stations, airports, and city centres people already use. Capital at risk.",
  openGraph: {
    title: "Parkwise | Invest in parking assets",
    description:
      "They park. You earn. Browse published parking opportunities. Access by invitation. Capital at risk.",
    type: "website",
    siteName: "Parkwise",
    images: [{ url: "/assets/brand/hero-main.jpg", width: 1200, height: 630, alt: "A modern European parking structure beside a railway station" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Parkwise | Invest in parking assets",
    description:
      "They park. You earn. Browse published parking opportunities. Access by invitation. Capital at risk."
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <DemoBanner />
        <SiteHeaderGate>
          <SiteHeaderHost />
        </SiteHeaderGate>
        <div id="main-content" tabIndex={-1}>{children}</div>
        <SiteFooterGate>
          <SiteFooter />
        </SiteFooterGate>
      </body>
    </html>
  );
}

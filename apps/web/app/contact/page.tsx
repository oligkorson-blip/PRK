import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Parkwise for support, parking-space hosting, opportunity questions, or complaints guidance."
};

export default function ContactPage() {
  return (
    <main>
      <PageIntro
        variant="functional"
        kicker="Contact"
        title="Talk to the team"
        lead="Questions about an opportunity, your account, documents, or listing a parking space?"
      />
      <section className="section">
        <div className="container">
          <div className="grid-3">
            <article className="info-card">
              <h3>Email</h3>
              <p>
                <a href="mailto:contact@parkwise.eu">contact@parkwise.eu</a>
              </p>
            </article>
            <article className="info-card">
              <h3>Phone</h3>
              <p>
                <a className="contact-strong" href="tel:+35316994240">
                  +353 1 699 42 40
                </a>
                <br />
                Mon–Fri, 9:00–18:00 CET
              </p>
            </article>
            <article className="info-card">
              <h3>List a parking space</h3>
              <p>
                <Link href="/list-a-space">Send your space details →</Link>
              </p>
            </article>
            <article className="info-card">
              <h3>Complaints</h3>
              <p>
                <Link href="/legal/complaints">Read the complaints process →</Link>
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}

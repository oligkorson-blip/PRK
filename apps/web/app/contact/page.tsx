import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { CONTACT } from "@/lib/copy/consumer";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Parkwise for support, parking-space hosting, opportunity questions, or complaints guidance."
};

export default function ContactPage() {
  return (
    <main>
      <PageIntro
        variant="functional"
        kicker={CONTACT.kicker}
        title={CONTACT.title}
        lead={CONTACT.lead}
      />
      <section className="section">
        <div className="container">
          <div className="grid-3">
            <article className="info-card">
              <h3>{CONTACT.emailLabel}</h3>
              <p>
                <a href="mailto:contact@parkwise.eu">contact@parkwise.eu</a>
              </p>
            </article>
            <article className="info-card">
              <h3>{CONTACT.phoneLabel}</h3>
              <p>
                <a className="contact-strong" href="tel:+35316994240">
                  +353 1 699 42 40
                </a>
                <br />
                {CONTACT.phoneHours}
              </p>
            </article>
            <article className="info-card">
              <h3>{CONTACT.listSpaceLabel}</h3>
              <p>
                <Link href="/list-a-space">{CONTACT.listSpaceLinkLabel}</Link>
              </p>
            </article>
            <article className="info-card">
              <h3>{CONTACT.complaintsLabel}</h3>
              <p>{CONTACT.complaintsBody}</p>
              <p>
                <Link href="/legal/complaints">{CONTACT.complaintsLinkLabel}</Link>
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}

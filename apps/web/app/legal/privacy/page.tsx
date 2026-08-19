import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL_META } from "@/lib/copy/legal-meta";
import { formatDateDdMmYyyy } from "@/lib/format";

export const metadata: Metadata = {
  title: LEGAL_META.privacy.title,
  description: LEGAL_META.privacy.description
};

export default function PrivacyPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Legal</span>
          <h1 className="display-l">Privacy notice</h1>
          <p className="lead">
            How Parkwise uses your personal data when you browse, apply, and invest — under GDPR
            principles.
          </p>
          <p className="field-hint stack-3">Last updated {formatDateDdMmYyyy(LEGAL_META.privacy.effective)}.</p>
        </div>
      </section>
      <section className="section legal-content">
        <div className="container prose-legal">
          <p>
            <strong>Controller.</strong> Parkwise (Ireland) processes personal data for applications,
            account access, KYC/AML, and investor communications.
          </p>
          <p>
            <strong>Data we process.</strong> Identity and contact details, application profile,
            authentication data, KYC documents you upload, interest and investment records, and
            technical logs needed to operate the service.
          </p>
          <p>
            <strong>Purposes &amp; bases.</strong> Contract / pre-contract steps (applications,
            account setup), legal obligations (AML where applicable), and legitimate interests in
            securing the platform and preventing fraud.
          </p>
          <p>
            <strong>Retention (KYC).</strong> Identity packs are retained while your account is under
            review or active, and for a minimum period required by applicable AML/record-keeping rules
            after closure or rejection (typically up to 5 years where mandated). After that we delete
            or anonymise. You may request a copy of your data or erasure subject to legal overrides.
          </p>
          <p>
            <strong>Retention (access logs).</strong> Sign-in logs — IP address, city-level location,
            ISP, and VPN/proxy flags — are kept for 365 days, then deleted.
          </p>
          <p>
            <strong>Processors.</strong> Hosting, email, and storage providers acting on our
            instructions, plus a third-party IP geolocation API that adds city-level location and
            VPN/proxy flags to sign-in logs. We do not sell personal data.
          </p>
          <p>
            <strong>Your rights.</strong> Access, rectification, erasure, restriction, objection, and
            portability where applicable. You can download a copy of your data yourself any time from
            your portal settings (<strong>Download my data</strong>). For erasure, email{" "}
            <a href="mailto:contact@parkwise.eu">contact@parkwise.eu</a> — an administrator anonymises
            your personal data and deletes your KYC documents, while holdings and distribution records
            are kept where the law requires, and KYC documents may be kept under a recorded legal
            hold. You may lodge a complaint with your supervisory authority.
          </p>
          <p>
            See also <Link href="/legal/cookies">Cookies</Link> and <Link href="/legal/terms">Terms</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

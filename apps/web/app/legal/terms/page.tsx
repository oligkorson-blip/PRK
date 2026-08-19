import Link from "next/link";
import type { Metadata } from "next";
import { LEGAL_META } from "@/lib/copy/legal-meta";
import { formatDateDdMmYyyy } from "@/lib/format";

export const metadata: Metadata = {
  title: LEGAL_META.terms.title,
  description: LEGAL_META.terms.description
};

import {
  COI_DISCLOSURE,
  HOLDING_MEANING,
  INVITE_SLA_COPY,
  PERIMETER_STATEMENT,
  RISK_LINE_SHORT
} from "@/lib/copy/posture";

export default function TermsPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Legal</span>
          <h1 className="display-l">Platform terms</h1>
          <p className="lead">
            The rules for using Parkwise as an investor.
          </p>
          <p className="field-hint stack-3">Last updated {formatDateDdMmYyyy(LEGAL_META.terms.effective)}.</p>
        </div>
      </section>
      <section className="section legal-content">
        <div className="container prose-legal">
          <p>
            <strong>Parties.</strong> These terms are between you and Parkwise (Ireland). By applying
            for an account or using the platform, you agree to these terms and the Risk Disclosure.
          </p>
          <p>
            <strong>Nature of the service (perimeter).</strong> {PERIMETER_STATEMENT}
          </p>
          <p>
            <strong>Access.</strong> You create an account by applying; Parkwise may approve, decline,
            or invite you at its discretion. Open self-serve investing without review is not offered.{" "}
            {INVITE_SLA_COPY} Expressing interest is non-binding.
          </p>
          <p>
            <strong>Confirmed investments.</strong> {HOLDING_MEANING}
          </p>
          <p>
            <strong>Eligibility &amp; KYC.</strong> You must complete onboarding and any requested
            KYC/AML checks before an investment can be confirmed. Providing false information is
            grounds for suspension. Appropriateness questions in onboarding are not personalised
            investment advice.
          </p>
          <p>
            <strong>Conflicts of interest.</strong> {COI_DISCLOSURE}
          </p>
          <p>
            <strong>Fees.</strong> Unless separately disclosed in writing, Parkwise does not charge a
            platform fee today. Any future fees will be stated before they apply.
          </p>
          <p>
            <strong>Operators &amp; places.</strong> Operator patterns and city/station names describe
            catalogue context. They do not imply a live concession, partnership, or endorsement by
            that operator or venue owner.
          </p>
          <p>
            <strong>Buyback.</strong> Buyback terms are not offered on this site unless a funded
            mechanism is separately disclosed and enabled. Do not rely on buyback language from other
            platforms.
          </p>
          <p>
            <strong>Liability.</strong> To the extent permitted by law, Parkwise is not liable for
            investment losses, operator performance, or decisions you make based on catalogue content.
            Nothing excludes liability that cannot be excluded under Irish law.
          </p>
          <p>
            <strong>Governing law.</strong> Ireland. Courts of Ireland have exclusive jurisdiction,
            without prejudice to mandatory consumer protections where they apply.
          </p>
          <p>
            <strong>Compliance before confirmation.</strong> We complete identity and compliance
            checks before confirming any investment.
          </p>
          <p>
            <strong>Contact &amp; complaints.</strong> See the{" "}
            <Link href="/legal/complaints">Complaints</Link> page. {RISK_LINE_SHORT}
          </p>
        </div>
      </section>
    </main>
  );
}

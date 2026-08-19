import type { Metadata } from "next";
import { LEGAL_META } from "@/lib/copy/legal-meta";
import { formatDateDdMmYyyy } from "@/lib/format";

export const metadata: Metadata = {
  title: LEGAL_META.complaints.title,
  description: LEGAL_META.complaints.description
};

export default function ComplaintsPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Legal</span>
          <h1 className="display-l">Complaints</h1>
          <p className="lead">
            If something went wrong with your Parkwise experience, tell us clearly and we will
            review it.
          </p>
          <p className="field-hint stack-3">Last updated {formatDateDdMmYyyy(LEGAL_META.complaints.effective)}.</p>
        </div>
      </section>
      <section className="section legal-content">
        <div className="container prose-legal">
          <p>
            Email <a href="mailto:contact@parkwise.eu">contact@parkwise.eu</a> with the subject line
            “Complaint”, your contact details, and a clear description of the issue.
          </p>
          <p>
            We aim to acknowledge complaints within <strong>5 business days</strong> and to provide a
            substantive response as soon as practicable after review.
          </p>
          <p>
            If you remain dissatisfied, you may escalate through any statutory redress route available
            to you in your jurisdiction. This page does not limit mandatory consumer or investor
            protections.
          </p>
          <p>
            Parkwise is not a regulated investment firm, so based on our current regulatory
            perimeter we believe statutory financial-services ombudsman routes (such as the FSPO in
            Ireland) do not cover complaints about this platform; general consumer-protection and
            court routes in your jurisdiction remain available.
          </p>
        </div>
      </section>
    </main>
  );
}

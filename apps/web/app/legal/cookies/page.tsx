import type { Metadata } from "next";
import { LEGAL_META } from "@/lib/copy/legal-meta";
import { formatDateDdMmYyyy } from "@/lib/format";

export const metadata: Metadata = {
  title: LEGAL_META.cookies.title,
  description: LEGAL_META.cookies.description
};

export default function CookiesPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Legal</span>
          <h1 className="display-l">Cookie notice</h1>
          <p className="lead">
            What cookies and similar technology this site uses so you can sign in and use your
            account securely.
          </p>
          <p className="field-hint stack-3">Last updated {formatDateDdMmYyyy(LEGAL_META.cookies.effective)}.</p>
        </div>
      </section>
      <section className="section legal-content">
        <div className="container prose-legal">
          <p>
            Parkwise uses <strong>necessary</strong> cookies and storage for authentication, security,
            and load balancing. Without them, sign-in and your dashboard cannot work.
          </p>
          <p>
            If optional analytics cookies are introduced later, we will update this notice and request
            consent where required. Today, the public marketing pages do not depend on advertising
            trackers.
          </p>
          <p>
            See the <a href="/legal/privacy">Privacy notice</a> for broader data processing.
          </p>
        </div>
      </section>
    </main>
  );
}

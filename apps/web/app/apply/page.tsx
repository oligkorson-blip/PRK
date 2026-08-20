import Link from "next/link";
import { ApplyWizard } from "@/components/apply-wizard";
import type { Metadata } from "next";
import { APPLY_INTRO, APPLY_TRUST_ITEMS, RISK_LINE } from "@/lib/copy/consumer";
import { INVITE_SLA_COPY } from "@/lib/copy/posture";

export const metadata: Metadata = {
  title: "Request an invitation",
  description:
    "Request a Parkwise invitation to review documents, risks, and parking opportunities."
};

type ApplySearchParams = {
  asset?: string | string[];
  option?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}

export default async function ApplyPage({
  searchParams
}: {
  searchParams?: Promise<ApplySearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const assetSlug = firstParam(params.asset);
  const optionId = firstParam(params.option);
  const opportunityHref = assetSlug
    ? `/opportunities/${encodeURIComponent(assetSlug)}${optionId ? `?option=${encodeURIComponent(optionId)}` : ""}`
    : null;

  return (
    <main className="apply-page">
      <section className="section bg-cream apply-shell" aria-labelledby="apply-heading">
        <div className="container">
          <div className="register-shell">
            <header className="apply-intro page-intro-task">
              <span className="kicker">{APPLY_INTRO.kicker}</span>
              <h1 id="apply-heading" className="h2 page-intro-title">
                {APPLY_INTRO.title}
              </h1>
              <p className="lead">
                {APPLY_INTRO.lead}
              </p>
              <p className="field-hint stack-3">{RISK_LINE}</p>
              {opportunityHref ? (
                <p className="field-hint stack-3">
                  {APPLY_INTRO.returnPrompt}{" "}
                  <Link className="link-arrow" href={opportunityHref}>
                    {APPLY_INTRO.returnLabel}
                  </Link>
                </p>
              ) : null}
            </header>

            <ApplyWizard opportunitySlug={assetSlug ?? undefined} opportunityOption={optionId ?? undefined} />

            <div className="trust-row" aria-label="What to expect">
              <div className="trust-item">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 3l7 3v5c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-3z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 12l2 2 4-4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div>
                  <b>Clear terms ahead</b>
                  <span>Docs before you invest</span>
                </div>
              </div>
              <div className="trust-item">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 20h16M6 20V9l6-5 6 5v11"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 20v-4h4v4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div>
                  <b>Professional operators</b>
                  <span>Day-to-day site management</span>
                </div>
              </div>
              <div className="trust-item">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect
                    x="4"
                    y="5"
                    width="16"
                    height="15"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M4 10h16M8 3v4M16 3v4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M9 15.5l2 2 4-4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div>
                  <b>Target monthly income</b>
                  <span>Not guaranteed</span>
                </div>
              </div>
            </div>

            <p className="field-hint apply-sla stack-4">{INVITE_SLA_COPY}</p>
            <p className="apply-signin apply-signin-centered">
              Already applied or have an account? <Link href="/sign-in">Sign in</Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

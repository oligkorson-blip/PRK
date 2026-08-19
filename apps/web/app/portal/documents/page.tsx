import Link from "next/link";
import { ensureInvestor } from "@/lib/auth/investor";
import { countOpenAgreementsForInvestor } from "@/lib/contracts/portal-counts";
import { listDocumentsForInvestor } from "@/lib/documents/queries";
import { listInterestStatusesForInvestor } from "@/lib/interests/queries";
import { listHoldingsWithAssets } from "@/lib/portfolio/queries";
import { documentPackGuidance } from "@/lib/portal/document-pack-guidance";
import {
  DOCUMENT_CATEGORY_LABEL,
  DOCUMENT_OWNER_TYPE_LABEL
} from "@/lib/portal/labels";

export const dynamic = "force-dynamic";

export default async function PortalDocumentsPage() {
  // Onboarding gate lives in app/portal/layout.tsx.
  const investor = await ensureInvestor();
  const docs = await listDocumentsForInvestor();

  const [interestStatuses, holdings, openAgreements] = await Promise.all([
    listInterestStatusesForInvestor(investor.id),
    listHoldingsWithAssets(investor.id),
    countOpenAgreementsForInvestor(investor.id)
  ]);
  const guidance = documentPackGuidance({
    kycStatus: investor.kycStatus,
    pendingInterests: interestStatuses.filter((i) => i.status === "pending").length,
    activeHoldings: holdings.filter((h) => h.status === "active").length,
    openAgreements
  });

  return (
    <main className="dash-content">
      <section className="section-tight portal-page-head">
        <span className="portal-eyebrow">Your records</span>
        <h1 className="display-m">Documents</h1>
        <p className="lead">
          Find opportunity documents, terms, and statements without searching through email.
        </p>
        <p className="field-hint">
          Need to add your own verification documents?{" "}
          <Link className="link-arrow" href="/portal/kyc">
            Manage verification documents
          </Link>
        </p>
        <div className="portal-banner portal-banner-info" role="status">
          <p>
            <strong>When an investment is ready</strong>
          </p>
          <p>
            We’ll show you a plain-language summary first, then the complete agreement to review.
            You’ll always have time to ask questions before anything becomes effective.
          </p>
          <Link className="link-arrow" href="/contact">
            Questions? Contact the team
          </Link>
        </div>
      </section>

      <section className="section-tight">
        {docs.length === 0 ? (
          <div className="empty-state">
            <h2 className="h3">{guidance.title}</h2>
            <p className="lead">{guidance.body}</p>
            <div className="apply-actions stack-4">
              <Link className="btn btn-primary" href={guidance.href}>
                {guidance.cta}
              </Link>
              <Link className="btn btn-ghost" href="/documents">
                Browse public documents
              </Link>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data data-compact">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="hide-mobile">
                    Scope
                  </th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <b>{d.title}</b>
                    </td>
                    <td>{DOCUMENT_CATEGORY_LABEL[d.category] ?? d.category}</td>
                    <td className="hide-mobile">
                      {DOCUMENT_OWNER_TYPE_LABEL[d.ownerType] ?? d.ownerType}
                    </td>
                    <td>
                      <a
                        className="link-arrow"
                        href={`/api/documents/${d.id}/download`}
                        aria-label={`Download ${d.title}`}
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

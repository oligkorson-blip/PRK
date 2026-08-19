import Link from "next/link";
import { ensureInvestor } from "@/lib/auth/investor";
import { listInvestorOwnedDocuments } from "@/lib/documents/queries";
import { KYC_CATEGORY_LABEL } from "@/lib/kyc/categories";
import { KycUploadForm } from "@/components/kyc-upload-form";
import { RemoveKycDocumentButton } from "@/components/remove-kyc-document-button";

export default async function PortalKycPage() {
  // Onboarding gate lives in app/portal/layout.tsx.
  const investor = await ensureInvestor();

  const files = await listInvestorOwnedDocuments(investor.id);
  const canManageFiles = investor.accountStatus === "active" &&
    (investor.kycStatus === "not_started" || investor.kycStatus === "rejected");

  return (
    <main className="dash-content">
      <section className="section-tight portal-page-head">
        <span className="portal-eyebrow">Account protection</span>
        <h1 className="display-m">Identity check</h1>
        <p className="lead">
          Verify your account securely before an investment can be confirmed. You can keep
          exploring opportunities while the team reviews your documents.
        </p>
      </section>
      <section className="section-tight">
        <KycUploadForm
          kycStatus={investor.kycStatus}
          accountStatus={investor.accountStatus}
          rejectReason={investor.kycRejectReason}
          accountType={investor.accountType ?? "individual"}
          uploadedCategories={[...new Set(files.map((file) => file.category))]}
        />
        <p className="field-hint stack-4">
          {canManageFiles ? (
            "Before submitting, download a file or replace it if needed."
          ) : (
            <>
              You can download your documents here. Need to update one?{" "}
              <Link className="link-arrow" href="/contact">
                Talk to the team
              </Link>
              .
            </>
          )}
        </p>
        {files.length > 0 ? (
          <ul className="portal-file-list stack-6">
            {files.map((f) => (
              <li key={f.id} className="portal-file-row">
                <span>{KYC_CATEGORY_LABEL[f.category] ?? f.category}: {f.title}</span>
                <span className="document-row-actions">
                  <Link
                    className="link-arrow"
                    href={`/api/documents/${f.id}/download`}
                    aria-label={`Download ${f.title}`}
                  >
                    Download
                  </Link>
                  {canManageFiles ? <RemoveKycDocumentButton documentId={f.id} title={f.title} /> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="portal-file-empty stack-6">No documents uploaded yet.</p>
        )}
      </section>
    </main>
  );
}
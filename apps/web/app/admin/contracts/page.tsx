import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { listContractsForAdmin } from "@/lib/contracts/admin-queries";
import { contractStateLabel } from "@/lib/contracts/lifecycle";
import { formatDateDdMmYyyy } from "@/lib/format";
import { isStorageConfigured } from "@/lib/storage/local";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { SignedContractDocumentUploadForm } from "@/components/signed-contract-document-upload-form";

export const dynamic = "force-dynamic";

export default async function AdminContractsPage() {
  try {
    await requireSuperAdmin();
  } catch {
    redirect("/admin");
  }

  const contracts = await listContractsForAdmin();
  const publishable = contracts.filter(
    (contract) => contract.state === "effective" && contract.signedDocumentId == null
  );

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Agreements"
        subtitle="Review contract status and publish final signed copies to each investor’s private vault."
      />

      <AdminSection title="Publish signed copy">
        <SignedContractDocumentUploadForm
          contracts={publishable.map((contract) => ({
            id: contract.id,
            version: contract.version,
            investorEmail: contract.investorEmail
          }))}
          storageConfigured={isStorageConfigured()}
        />
      </AdminSection>

      <AdminSection title="Agreement queue">
        {contracts.length === 0 ? (
          <p className="lead">No agreements have been created yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table docs-table">
              <thead>
                <tr>
                  <th scope="col">Investor</th>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Signed copy</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Record</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id}>
                    <td>
                      <b>{contract.investorName || contract.investorEmail}</b>
                      <span className="doc-phone-metrics">{contract.investorEmail}</span>
                    </td>
                    <td>{contract.version}</td>
                    <td><span className="badge">{contractStateLabel(contract.state)}</span></td>
                    <td>
                      {contract.signedDocumentId && contract.signedDocumentTitle ? (
                        <a className="link-arrow" href={`/api/documents/${contract.signedDocumentId}/download`}>
                          {contract.signedDocumentTitle}
                        </a>
                      ) : contract.signedDocumentId ? (
                        "Retracted"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatDateDdMmYyyy(contract.updatedAt)}</td>
                    <td>
                      <Link className="link-arrow" href={`/admin/contracts/${contract.id}`}>
                        View audit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </div>
  );
}

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import { listAssetOptions } from "@/lib/assets/queries";
import { listDocumentsForAdmin } from "@/lib/documents/queries";
import { listActiveHoldingsForAdmin } from "@/lib/portfolio/queries";
import { listInvestorsForStaff } from "@/lib/investors/queries";
import { DOCUMENT_CATEGORY_LABEL, DOCUMENT_OWNER_TYPE_LABEL } from "@/lib/portal/labels";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { DocumentUploadForm } from "@/components/document-upload-form";
import { RetractDocumentButton } from "@/components/retract-document-button";
import { formatDateDdMmYyyy } from "@/lib/format";
import { isStorageConfigured } from "@/lib/storage/local";

export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  const assetRows = staff.role === "super_admin" ? await listAssetOptions() : [];
  const docs = await listDocumentsForAdmin({ role: staff.role, staffId: staff.staff.id });
  const holdingRows = await listActiveHoldingsForAdmin();
  const investorRows = await listInvestorsForStaff();

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Documents"
        subtitle={
          !isStorageConfigured()
            ? "Document storage is not configured — set DOCUMENTS_DIR to enable uploads."
            : "Upload and review vault documents in scope for your role."
        }
      />

      <AdminSection title="Upload">
        <DocumentUploadForm
          assets={assetRows}
          holdings={holdingRows.map((h) => ({
            id: h.id,
            investorEmail: h.investorEmail,
            assetName: h.assetName,
            amountEur: Number(h.amountEur)
          }))}
          investors={investorRows.map((investor) => ({
            id: investor.id,
            email: investor.email,
            fullName: investor.fullName
          }))}
          isSuperAdmin={staff.role === "super_admin"}
          storageConfigured={isStorageConfigured()}
        />
      </AdminSection>

      <AdminSection title="All documents">
      {docs.length === 0 ? (
        <p className="lead">No documents yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table docs-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Category</th>
                <th scope="col">Owner</th>
                <th scope="col">Uploaded</th>
                <th scope="col">Uploader</th>
                <th scope="col" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <b>{d.title}</b>
                    {d.retractedAt ? (
                      <>
                        {" "}
                        <span className="badge badge-status-withdrawn">Retracted</span>
                      </>
                    ) : null}
                    <span className="doc-phone-metrics">
                      {DOCUMENT_CATEGORY_LABEL[d.category] ?? d.category} · {d.ownerName ?? DOCUMENT_OWNER_TYPE_LABEL[d.ownerType] ?? d.ownerType}
                      <br />
                      Uploaded {formatDateDdMmYyyy(d.createdAt)} by {d.uploaderEmail ?? "unknown"}
                    </span>
                  </td>
                  <td>{DOCUMENT_CATEGORY_LABEL[d.category] ?? d.category}</td>
                  <td>
                    {d.ownerName ?? DOCUMENT_OWNER_TYPE_LABEL[d.ownerType] ?? d.ownerType}
                  </td>
                  <td>{formatDateDdMmYyyy(d.createdAt)}</td>
                  <td className="cell-email" title={d.uploaderEmail ?? undefined}>
                    {d.uploaderEmail ?? "—"}
                  </td>
                  <td>
                    {/* Staff keep download access to retracted docs for audit;
                        only super admins may retract. */}
                    <div className="docs-row-actions">
                      <a
                        className="link-arrow"
                        href={`/api/documents/${d.id}/download`}
                        aria-label={`Download ${d.title}`}
                      >
                        Download
                      </a>
                      {staff.role === "super_admin" && !d.retractedAt ? (
                        <RetractDocumentButton documentId={d.id} title={d.title} />
                      ) : null}
                    </div>
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
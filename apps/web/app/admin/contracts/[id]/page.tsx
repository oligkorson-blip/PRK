import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { getContractForAdmin } from "@/lib/contracts/admin-queries";
import { contractStateLabel } from "@/lib/contracts/lifecycle";
import { formatDateDdMmYyyy, formatDateTimeUtc, isUuid } from "@/lib/format";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { ManualContractSignatureForm } from "@/components/manual-contract-signature-form";

const SIGNER_ROLE_LABEL: Record<string, string> = {
  investor: "Investor",
  legal_signer: "Park legal signer"
};

const SIGNATURE_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired"
};

const ACTOR_TYPE_LABEL: Record<string, string> = {
  investor: "Investor",
  legal_signer: "Park legal signer",
  staff: "Staff",
  provider: "Verified signing provider",
  system: "System"
};

export const dynamic = "force-dynamic";

export default async function AdminContractDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireSuperAdmin();
  } catch {
    redirect("/admin");
  }

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const contract = await getContractForAdmin(id);
  if (!contract) notFound();

  const investorName = contract.investorName || contract.investorEmail;

  return (
    <div className="admin-page">
      <p className="field-hint">
        <Link href="/admin/contracts">Agreements</Link> / {contract.version}
      </p>
      <AdminPageHeader
        title={`Agreement ${contract.version}`}
        subtitle={`${investorName} · ${contract.investorEmail}`}
      />

      <AdminSection title="Current status">
        <div className="dash-panel">
          <p className="field-hint">Current lifecycle state</p>
          <p className="lead"><span className="badge">{contractStateLabel(contract.state)}</span></p>
          <p className="field-hint">
            Created {formatDateDdMmYyyy(contract.createdAt)} · Updated {formatDateDdMmYyyy(contract.updatedAt)}
          </p>
        </div>
      </AdminSection>

      <AdminSection title="Current signer state">
        <div className="table-wrap">
          <table className="admin-table docs-table">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Signer</th>
                <th scope="col">Status</th>
                <th scope="col">Signed</th>
              </tr>
            </thead>
            <tbody>
              {contract.signers.map((signer) => (
                <tr key={signer.id}>
                  <td>{SIGNER_ROLE_LABEL[signer.role] ?? signer.role}</td>
                  <td>
                    <b>{signer.displayName}</b>
                    <span className="doc-phone-metrics">{signer.email}</span>
                  </td>
                  <td><span className="badge">{SIGNATURE_STATUS_LABEL[signer.status] ?? signer.status}</span></td>
                  <td>{signer.signedAt ? formatDateTimeUtc(signer.signedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <AdminSection title="Manual signing">
        <p className="field-hint">
          Use this workflow until an e-sign provider is selected. Record the date shown on the signed agreement;
          the action is added to the staff audit trail and uses the same lifecycle guards as provider events.
        </p>
        <ManualContractSignatureForm
          contractId={contract.id}
          contractVersion={contract.version}
          signers={contract.signers.map((signer) => ({
            role: signer.role,
            displayName: signer.displayName,
            status: signer.status
          }))}
          signingClosed={["effective", "signed_documents_available", "superseded", "withdrawn"].includes(contract.state)}
        />
      </AdminSection>

      <AdminSection title="Lifecycle transition audit">
        {contract.transitions.length === 0 ? (
          <p className="lead">No lifecycle transitions have been recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table docs-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Transition</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {contract.transitions.map((transition) => (
                  <tr key={transition.id}>
                    <td>{formatDateTimeUtc(transition.occurredAt)}</td>
                    <td>
                      {transition.fromState
                        ? `${contractStateLabel(transition.fromState)} → ${contractStateLabel(transition.toState)}`
                        : contractStateLabel(transition.toState)}
                    </td>
                    <td>
                      {ACTOR_TYPE_LABEL[transition.actorType] ?? transition.actorType}
                      <span className="doc-phone-metrics">{transition.actorId}</span>
                    </td>
                    <td>{transition.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      <AdminSection title="Verified signature events">
        {contract.signatureEvents.length === 0 ? (
          <p className="lead">No verified signature events have been received yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table docs-table">
              <thead>
                <tr>
                  <th scope="col">Occurred</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Signer role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Event ID</th>
                  <th scope="col">Provider signer ID</th>
                </tr>
              </thead>
              <tbody>
                {contract.signatureEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTimeUtc(event.occurredAt)}</td>
                    <td>{event.provider}</td>
                    <td>{SIGNER_ROLE_LABEL[event.signerRole] ?? event.signerRole}</td>
                    <td><span className="badge">{SIGNATURE_STATUS_LABEL[event.status] ?? event.status}</span></td>
                    <td>{event.providerEventId}</td>
                    <td>{event.providerSignerId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      <AdminSection title="Signed copy">
        {contract.signedDocumentId && contract.signedDocumentTitle ? (
          <a className="link-arrow" href={`/api/documents/${contract.signedDocumentId}/download`}>
            {contract.signedDocumentTitle}
          </a>
        ) : contract.signedDocumentId ? (
          <p className="lead">The signed copy has been retracted from the investor vault.</p>
        ) : (
          <p className="lead">No final signed copy has been published yet.</p>
        )}
      </AdminSection>
    </div>
  );
}

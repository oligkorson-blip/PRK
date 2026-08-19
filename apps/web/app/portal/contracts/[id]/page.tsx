import Link from "next/link";
import { notFound } from "next/navigation";
import {
  contractStateLabel,
  nextContractAction
} from "@/lib/contracts/lifecycle";
import { ContractReviewActions } from "@/components/contract-review-actions";
import { getContractForInvestor } from "@/lib/contracts/queries";
import { formatDateDdMmYyyy, formatDateTimeUtc, isUuid } from "@/lib/format";

const SIGNER_ROLE_LABEL: Record<string, string> = {
  investor: "Your signature",
  legal_signer: "Park legal signature"
};

const SIGNATURE_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired"
};

export default async function ContractDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const contract = await getContractForInvestor(id);
  if (!contract) notFound();

  return (
    <main className="dash-content">
      <section className="section-tight portal-page-head">
        <p className="field-hint">
          <Link href="/portal/contracts">Agreements</Link> / {contract.version}
        </p>
        <h1 className="display-m">Agreement {contract.version}</h1>
        <p className="lead">{nextContractAction(contract.state)}</p>
        <p className="field-hint">
          Current status: <strong>{contractStateLabel(contract.state)}</strong> · Updated {formatDateDdMmYyyy(contract.updatedAt)}
        </p>
      </section>

      <section className="section-tight">
        <h2 className="display-s">Review documents</h2>
        <p className="lead">
          Read the summary and full agreement before confirming your review. Your confirmation is added to the agreement history.
        </p>
        {contract.reviewDocuments.summary || contract.reviewDocuments.agreement ? (
          <>
            <ul className="portal-file-list stack-4">
              {contract.reviewDocuments.summary ? (
                <li className="portal-file-row">
                  <span>
                    <strong>{contract.reviewDocuments.summary.title}</strong>
                    <span className="field-hint">Agreement summary</span>
                  </span>
                  <a
                    className="btn btn-primary"
                    href={"/api/documents/" + contract.reviewDocuments.summary.id + "/download"}
                  >
                    Download summary
                  </a>
                </li>
              ) : null}
              {contract.reviewDocuments.agreement ? (
                <li className="portal-file-row">
                  <span>
                    <strong>{contract.reviewDocuments.agreement.title}</strong>
                    <span className="field-hint">Full agreement</span>
                  </span>
                  <a
                    className="btn btn-primary"
                    href={"/api/documents/" + contract.reviewDocuments.agreement.id + "/download"}
                  >
                    Download agreement
                  </a>
                </li>
              ) : null}
            </ul>
            <ContractReviewActions
              contractId={contract.id}
              contractVersion={contract.version}
              state={contract.state}
              summaryAvailable={Boolean(contract.reviewDocuments.summary)}
              agreementAvailable={Boolean(contract.reviewDocuments.agreement)}
            />
            <p className="field-hint">
              When you are ready to sign, contact the Park team. The current provider-free workflow records signatures manually and will update this page after the team records them.
            </p>
          </>
        ) : (
          <p className="lead">The agreement documents are not available yet. We will notify you when they are ready.</p>
        )}
      </section>

      <section className="section-tight">
        <h2 className="display-s">Signing progress</h2>
        <ul className="portal-file-list stack-4">
          {contract.signers.map((signer) => (
            <li className="portal-file-row" key={signer.id}>
              <span>{SIGNER_ROLE_LABEL[signer.role] ?? signer.role}</span>
              <span className="document-row-actions">
                <span className="badge">{SIGNATURE_STATUS_LABEL[signer.status] ?? signer.status}</span>
                {signer.signedAt ? (
                  <span className="field-hint">{formatDateDdMmYyyy(signer.signedAt)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-tight">
        <h2 className="display-s">Signed documents</h2>
        {contract.signedDocument ? (
          <div className="dash-panel">
            <h3>{contract.signedDocument.title}</h3>
            <p>Final signed copy stored in your private document vault.</p>
            <a
              className="btn btn-primary"
              href={"/api/documents/" + contract.signedDocument.id + "/download"}
            >
              Download signed copy
            </a>
          </div>
        ) : (
          <p className="lead">
            Signed copies will appear here after the agreement is effective and the final document has been stored.
          </p>
        )}
      </section>

      <section className="section-tight">
        <h2 className="display-s">Agreement history</h2>
        <ol className="portal-file-list stack-4">
          {contract.transitions.map((transition) => (
            <li className="portal-file-row" key={transition.id}>
              <span>
                {transition.fromState
                  ? contractStateLabel(transition.fromState) + " → " + contractStateLabel(transition.toState)
                  : contractStateLabel(transition.toState)}
              </span>
              <span className="field-hint">
                {formatDateTimeUtc(transition.occurredAt)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

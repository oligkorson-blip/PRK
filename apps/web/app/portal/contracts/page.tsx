import Link from "next/link";
import { listContractsForInvestor } from "@/lib/contracts/queries";
import { contractStateLabel, nextContractAction } from "@/lib/contracts/lifecycle";
import { PORTAL_EMPTY } from "@/lib/copy/consumer";
import { formatDateDdMmYyyy } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const contracts = await listContractsForInvestor();

  return (
    <main className="dash-content">
      <section className="section-tight portal-page-head">
        <span className="portal-eyebrow">Agreements</span>
        <h1 className="display-m">Your agreements</h1>
        <p className="lead">{PORTAL_EMPTY.noAgreements}</p>
      </section>

      <section className="section-tight">
        {contracts.length === 0 ? (
          <div className="empty-state">
            <h2 className="h3">No agreements yet</h2>
            <p className="lead">{PORTAL_EMPTY.noAgreements}</p>
            <div className="apply-actions stack-4">
              <Link className="btn btn-ghost" href="/portal/documents">
                Open documents
              </Link>
              <Link className="btn btn-ghost" href="/portal/interests">
                View requests
              </Link>
              <Link className="link-arrow" href="/contact">
                {PORTAL_EMPTY.contactForHelp}
              </Link>
            </div>
          </div>
        ) : (
          <ul className="interest-list">
            {contracts.map((contract) => (
              <li className="interest-card" key={contract.id}>
                <div className="interest-card-main">
                  <Link className="interest-card-name" href={`/portal/contracts/${contract.id}`}>
                    Agreement {contract.version}
                  </Link>
                  <p className="interest-card-meta">
                    Updated {formatDateDdMmYyyy(contract.updatedAt)}
                  </p>
                  <p className="field-hint">{nextContractAction(contract.state)}</p>
                </div>
                <div className="interest-card-side">
                  <span className="badge">{contractStateLabel(contract.state)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

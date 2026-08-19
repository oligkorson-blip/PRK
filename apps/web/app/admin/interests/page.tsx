import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/staff";
import {
  getInterestConfirmPreflightsForStaff
} from "@/lib/interests/confirm-preflight-queries";
import {
  listConfirmedInterestsWithoutAgreement,
  listPendingInterestsForStaff
} from "@/lib/interests/queries";
import { formatEur, formatDateDdMmYyyy } from "@/lib/format";
import { AdminInterestActions } from "@/components/admin-interest-actions";
import { CreateAgreementFromInterestButton } from "@/components/admin-create-agreement-button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { KYC_STATUS_LABEL } from "@/lib/portal/labels";

type SearchParams = { searchParams: Promise<{ filter?: string }> };

export default async function AdminInterestsPage({ searchParams }: SearchParams) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/");
    }
    throw error;
  }

  const params = await searchParams;
  const fourEyesOnly = params.filter === "four-eyes";
  const agreementsGap = params.filter === "agreements";
  const scope = { role: staff.role, staffId: staff.staff.id };

  const pendingInterests = agreementsGap
    ? []
    : await listPendingInterestsForStaff(scope, { fourEyesOnly });

  const preflightMap = await getInterestConfirmPreflightsForStaff({
    interestIds: pendingInterests.map((i) => i.id),
    staffRole: staff.role
  });

  const needsAgreement =
    staff.role === "super_admin"
      ? await listConfirmedInterestsWithoutAgreement(scope)
      : agreementsGap
        ? []
        : await listConfirmedInterestsWithoutAgreement(scope);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title={
          fourEyesOnly
            ? "Four-eyes inbox"
            : agreementsGap
              ? "Agreements needed"
              : "Investment requests"
        }
        subtitle={
          fourEyesOnly
            ? "Requests that already have a first super-admin approval and need a second."
            : agreementsGap
              ? "Confirmed interests that still need an agreement created."
              : "Review what each investor has requested, check readiness, and confirm only when the record is ready."
        }
        actions={
          <div className="apply-actions">
            <Link className="btn btn-ghost btn-sm" href="/admin/interests">
              All pending
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/admin/interests?filter=four-eyes">
              Four-eyes
            </Link>
            {staff.role === "super_admin" ? (
              <Link className="btn btn-ghost btn-sm" href="/admin/interests?filter=agreements">
                Need agreement
              </Link>
            ) : null}
          </div>
        }
      />

      {agreementsGap ? (
        needsAgreement.length === 0 ? (
          <p className="lead">No confirmed interests are waiting for an agreement.</p>
        ) : (
          <ul className="interest-list">
            {needsAgreement.map((row) => (
              <li className="interest-card" key={row.id}>
                <div className="interest-card-main">
                  <Link href={`/admin/investors/${row.investorId}`}>{row.investorEmail}</Link>
                  <p className="interest-card-meta">
                    {row.assetName} · {formatEur(row.amountEur)} · confirmed{" "}
                    {formatDateDdMmYyyy(row.createdAt)}
                  </p>
                </div>
                <div className="interest-card-side">
                  <CreateAgreementFromInterestButton
                    interestId={row.id}
                    investorEmail={row.investorEmail}
                    assetName={row.assetName}
                    amountEur={row.amountEur}
                  />
                </div>
              </li>
            ))}
          </ul>
        )
      ) : pendingInterests.length === 0 ? (
        <p className="lead">
          {fourEyesOnly ? "No requests awaiting a second approval." : "No pending interests right now."}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table interests-table">
            <thead>
              <tr>
                <th scope="col">Investor</th>
                <th scope="col">KYC</th>
                <th scope="col">Opportunity</th>
                <th scope="col" className="cell-amount">
                  Amount
                </th>
                <th scope="col">Submitted</th>
                <th scope="col">Investor note</th>
                <th scope="col">Decision</th>
              </tr>
            </thead>
            <tbody>
              {pendingInterests.map((interest) => (
                <tr key={interest.id}>
                  <td className="cell-email" title={interest.investorEmail}>
                    <Link href={`/admin/investors/${interest.investorId}`}>
                      {interest.investorEmail}
                    </Link>
                    <div className="interest-phone-metrics">
                      {interest.assetName} · <strong>{formatEur(interest.amountEur)}</strong>
                      <br />
                      Submitted {formatDateDdMmYyyy(interest.createdAt)} · Note:{" "}
                      {interest.note ?? "None"}
                    </div>
                  </td>
                  <td>
                    {interest.kycStatus === "approved" ? (
                      KYC_STATUS_LABEL[interest.kycStatus] ?? interest.kycStatus
                    ) : (
                      <Link
                        className="link-arrow"
                        href={`/admin/investors/${interest.investorId}?tab=kyc`}
                      >
                        {KYC_STATUS_LABEL[interest.kycStatus] ?? interest.kycStatus}
                      </Link>
                    )}
                  </td>
                  <td>
                    <Link className="link-arrow" href={`/opportunities/${interest.assetSlug}`}>
                      {interest.assetName}
                    </Link>
                  </td>
                  <td className="cell-amount">{formatEur(interest.amountEur)}</td>
                  <td>{formatDateDdMmYyyy(interest.createdAt)}</td>
                  <td>{interest.note ?? "—"}</td>
                  <td>
                    <AdminInterestActions
                      interestId={interest.id}
                      kycStatus={interest.kycStatus}
                      pendingApprovalByEmail={interest.firstApprovedByEmail}
                      preflight={preflightMap.get(interest.id) ?? null}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!agreementsGap && !fourEyesOnly && staff.role === "super_admin" && needsAgreement.length > 0 ? (
        <section className="section-foot stack-6">
          <h2 className="h3">Confirmed — create agreement</h2>
          <ul className="interest-list">
            {needsAgreement.slice(0, 8).map((row) => (
              <li className="interest-card" key={row.id}>
                <div className="interest-card-main">
                  <Link href={`/admin/investors/${row.investorId}`}>{row.investorEmail}</Link>
                  <p className="interest-card-meta">
                    {row.assetName} · {formatEur(row.amountEur)}
                  </p>
                </div>
                <div className="interest-card-side">
                  <CreateAgreementFromInterestButton
                    interestId={row.id}
                    investorEmail={row.investorEmail}
                    assetName={row.assetName}
                    amountEur={row.amountEur}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

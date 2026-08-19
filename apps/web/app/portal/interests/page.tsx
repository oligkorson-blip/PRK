import Link from "next/link";
import { ensureInvestor } from "@/lib/auth/investor";
import { formatEur, formatDateDdMmYyyy } from "@/lib/format";
import { PORTAL_EMPTY, PORTAL_WITHDRAWAL_UNAVAILABLE } from "@/lib/copy/consumer";
import { listInterestsWithAssetsForInvestor } from "@/lib/interests/queries";
import { buildInterestRequestStages } from "@/lib/portal/interest-request-stages";
import { PortalAccessTimeline } from "@/components/portal-access-timeline";
import { WithdrawInterestButton } from "@/components/withdraw-interest-button";

const STATUS_LABEL: Record<string, string> = {
  pending: "Under review",
  confirmed: "Confirmed",
  declined: "Not progressed",
  withdrawn: "Withdrawn"
};

export default async function PortalInterestsPage() {
  // Onboarding gate lives in app/portal/layout.tsx.
  const investor = await ensureInvestor();

  const myInterests = await listInterestsWithAssetsForInvestor(investor.id);

  return (
    <main className="dash-content">
      <section className="section-tight portal-page-head">
        <span className="portal-eyebrow">Before you invest</span>
        <h1 className="display-m">Your requests</h1>
        <p className="lead">
          See the opportunities you have asked the team to review. A request is not a financial
          commitment.
        </p>
        {myInterests.some((i) => i.status === "pending") && investor.kycStatus !== "approved" ? (
          <div className="portal-banner" role="status">
            <p>
              You have pending interests. Complete{" "}
              <Link className="link-arrow" href="/portal/kyc">
                identity checks
              </Link>{" "}
              so we can confirm them.
            </p>
          </div>
        ) : myInterests.some((i) => i.status === "pending") ? (
          <div className="portal-banner" role="status">
            <p>{PORTAL_EMPTY.waitingOnTeam}</p>
          </div>
        ) : null}
      </section>

      <section className="section-tight">
        {myInterests.length === 0 ? (
          <div className="empty-state">
            <h2 className="h3">No requests yet</h2>
            <p className="lead">{PORTAL_EMPTY.noInterests}</p>
            <Link className="btn btn-primary" href="/opportunities">
              View opportunities
            </Link>
          </div>
        ) : (
          <ul className="interest-list">
            {myInterests.map((interest) => {
              const stages = buildInterestRequestStages({
                status: interest.status,
                kycStatus: investor.kycStatus
              });
              return (
                <li className="interest-card" key={interest.id}>
                  <div className="interest-card-main">
                    {interest.assetStatus === "published" ? (
                      <Link
                        className="interest-card-name"
                        href={`/opportunities/${interest.assetSlug}`}
                      >
                        {interest.assetName}
                      </Link>
                    ) : (
                      <span className="interest-card-name">{interest.assetName}</span>
                    )}
                    <p className="interest-card-meta">
                      {formatEur(interest.amountEur)} &middot;{" "}
                      {formatDateDdMmYyyy(interest.createdAt)}
                    </p>
                    {interest.note ? <p className="interest-card-note">{interest.note}</p> : null}
                    <PortalAccessTimeline className="stack-3 interest-request-stages" steps={stages} />
                  </div>
                  <div className="interest-card-side">
                    <span className={`badge badge-status-${interest.status}`}>
                      {STATUS_LABEL[interest.status] ?? interest.status}
                    </span>
                    {interest.status === "pending" ? (
                      investor.accountStatus === "active" ? (
                        <WithdrawInterestButton interestId={interest.id} />
                      ) : (
                        <span className="field-hint">{PORTAL_WITHDRAWAL_UNAVAILABLE}</span>
                      )
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

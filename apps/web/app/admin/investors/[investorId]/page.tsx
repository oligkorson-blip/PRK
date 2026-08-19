import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { StatusPill } from "@/components/admin/status-pill";
import { AdminInvestorDetailTabs } from "@/components/admin-investor-detail-tabs";
import {
  getInvestorDetailForStaff,
  listAccessEventsForAuthUser,
  type AccessEventRow,
  type InvestorDetail
} from "@/lib/access/queries";
import { getStaffContext } from "@/lib/auth/staff";
import { isUuid } from "@/lib/format";
import {
  getInvestorApplicationBundle,
  type InvestorApplicationRow,
  type InvestorDistributionRow,
  type InvestorHoldingRow,
  type InvestorInterestRow,
  type InvestorKycDocRow
} from "@/lib/investors/queries";
import { isErasedInvestorEmail } from "@/lib/privacy/erasure";
import {
  listInvestorActivityForStaff,
  type InvestorActivityItem
} from "@/lib/investors/activity";
import {
  ACCOUNT_STATUS_LABEL,
  APPLICATION_STATUS_LABEL,
  KYC_STATUS_LABEL
} from "@/lib/portal/labels";
import { InvestorErasureSection } from "./erasure-section";
import { ResetInvestorTwoFactorButton } from "./reset-two-factor-button";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ investorId: string }> };

export default async function AdminInvestorDetailPage({ params }: Params) {
  const staff = await getStaffContext();
  if (!staff) redirect("/");

  const { investorId } = await params;
  if (!isUuid(investorId)) notFound();

  let investor: InvestorDetail;
  let events: AccessEventRow[] = [];
  let application: InvestorApplicationRow | null = null;
  let kycDocs: InvestorKycDocRow[] = [];
  let interests: InvestorInterestRow[] = [];
  let holdings: InvestorHoldingRow[] = [];
  let distributions: InvestorDistributionRow[] = [];
  let activity: InvestorActivityItem[] = [];
  try {
    investor = await getInvestorDetailForStaff(investorId);
    events = investor.authUserId
      ? await listAccessEventsForAuthUser(investor.authUserId)
      : [];
    const bundle = await getInvestorApplicationBundle(investorId);
    application = bundle.application;
    kycDocs = bundle.kycDocs;
    interests = bundle.interests;
    holdings = bundle.holdings;
    distributions = bundle.distributions;
    activity = await listInvestorActivityForStaff(investorId);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title={investor.fullName || investor.email}
        subtitle={investor.fullName ? investor.email : "Investor record"}
        actions={
          <Link className="link-arrow" href="/admin/investors">
            Back to investors
          </Link>
        }
      />

      <div className="lead-identity">
        <span className="field-hint">Account</span>
        <StatusPill
          status={investor.accountStatus}
          label={ACCOUNT_STATUS_LABEL[investor.accountStatus] ?? investor.accountStatus}
        />
        <span className="field-hint">Application</span>
        {application ? (
          <StatusPill
            status={application.status}
            label={APPLICATION_STATUS_LABEL[application.status] ?? application.status}
          />
        ) : (
          <span className="stage-pill stage-pill-muted">No application</span>
        )}
        <span className="field-hint">KYC</span>
        <StatusPill
          status={investor.kycStatus}
          label={KYC_STATUS_LABEL[investor.kycStatus] ?? investor.kycStatus}
        />
      </div>

      <Suspense fallback={<p className="lead">Loading sections…</p>}>
        <AdminInvestorDetailTabs
          investor={investor}
          application={application}
          kycDocs={kycDocs}
          interests={interests}
          holdings={holdings}
          distributions={distributions}
          activity={activity}
          events={events}
        />
      </Suspense>

      {staff.role === "super_admin" ? (
        <AdminSection title="Two-factor authentication">
          <ResetInvestorTwoFactorButton
            investorId={investor.id}
            email={investor.email}
          />
        </AdminSection>
      ) : null}

      {staff.role === "super_admin" ? (
        <AdminSection title="Erasure (GDPR)">
          <InvestorErasureSection
            investorId={investor.id}
            investorEmail={investor.email}
            alreadyErased={isErasedInvestorEmail(investor.email, investor.id)}
          />
        </AdminSection>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { requireStaff } from "@/lib/auth/staff";
import { isTwoFactorEnabledForUser } from "@/lib/auth/queries";
import { TwoFactorOptionalBanner } from "@/components/two-factor-optional-banner";
import {
  describeAuditEvent,
  formatRelativeTime,
  getAdminDashboardKpis,
  getStaleLeadCountForStaff,
  listScopedActivityForStaff
} from "@/lib/admin/dashboard";
import { getAdminRoleHome } from "@/lib/admin/role-home";
import { listAmlChecklistForStaff } from "@/lib/aml/queries";
import { amlChecklistState } from "@/lib/aml/state";
import {
  countConfirmedInterestsWithoutAgreement,
  getPendingInterestCountsForStaff
} from "@/lib/interests/queries";
import { listInvestorsForStaff } from "@/lib/investors/queries";
import { getLeadDashboardCounts } from "@/lib/leads/queries";
import { getAdminWorkspaceGroups } from "@/lib/admin/workspaces";
import { isDemoMode } from "@/lib/demo-mode";

type AttentionItem = {
  href: string;
  label: string;
  value: string;
  count: number;
};

export default async function AdminPage() {
  let staff;
  try {
    staff = await requireStaff();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/");
    }
    throw error;
  }

  const isSuper = staff.role === "super_admin";
  const scope = { role: staff.role, staffId: staff.staff.id };
  const roleHome = getAdminRoleHome(staff.role);

  const [
    kpis,
    staleLeadCount,
    activity,
    interestCounts,
    investorBook,
    leadCounts,
    amlRows,
    twoFactorEnabled,
    agreementGap
  ] = await Promise.all([
    getAdminDashboardKpis(scope),
    getStaleLeadCountForStaff(scope),
    listScopedActivityForStaff(scope),
    getPendingInterestCountsForStaff(scope),
    listInvestorsForStaff(),
    getLeadDashboardCounts(),
    listAmlChecklistForStaff(),
    isTwoFactorEnabledForUser(staff.user.id),
    countConfirmedInterestsWithoutAgreement(scope)
  ]);

  const pendingInterests = interestCounts.pending;
  const kycBlockedPending = interestCounts.kycBlocked;
  const fourEyesPending = interestCounts.fourEyesPending;
  const pendingApplications = investorBook.filter(
    (row) =>
      row.accountStatus === "pending_access" ||
      row.applicationStatus === "submitted" ||
      row.applicationStatus === "contacted"
  ).length;
  const unassignedInvestors = isSuper
    ? investorBook.filter((row) => row.assignedAgentId === null).length
    : 0;
  const unassignedLeads = isSuper ? leadCounts.awaitingAssignment : leadCounts.ibQueue;
  const amlBlocking = amlRows.filter(
    (row) =>
      amlChecklistState({
        kycStatus: row.kycStatus,
        latestResult: row.latestCheck?.result ?? null
      }) === "blocking"
  ).length;

  const attention: AttentionItem[] = [];
  if (pendingApplications > 0) {
    attention.push({
      href: "/admin/investors?filter=pending",
      label: "Applications",
      value: `${pendingApplications} pending`,
      count: pendingApplications
    });
  }
  if (pendingInterests > 0) {
    attention.push({
      href: "/admin/interests",
      label: "Investment requests",
      value: `${pendingInterests} pending${kycBlockedPending > 0 ? ` · ${kycBlockedPending} KYC-blocked` : ""}`,
      count: pendingInterests
    });
  }
  if (fourEyesPending > 0) {
    attention.push({
      href: "/admin/interests?filter=four-eyes",
      label: "Four-eyes inbox",
      value: `${fourEyesPending} awaiting second approval`,
      count: fourEyesPending
    });
  }
  if (isSuper && agreementGap > 0) {
    attention.push({
      href: "/admin/interests?filter=agreements",
      label: "Agreements needed",
      value: `${agreementGap} confirmed without agreement`,
      count: agreementGap
    });
  }
  if (isSuper && unassignedInvestors > 0) {
    attention.push({
      href: "/admin/investors?filter=unassigned",
      label: "Unassigned investors",
      value: `${unassignedInvestors} need an agent`,
      count: unassignedInvestors
    });
  }
  if (unassignedLeads > 0) {
    attention.push({
      href: "/admin/leads?unassigned=1",
      label: isSuper ? "Leads awaiting assignment" : "Unassigned lead queue",
      value: `${unassignedLeads} waiting`,
      count: unassignedLeads
    });
  }
  if (leadCounts.overdueFollowUps > 0) {
    attention.push({
      href: "/admin/leads",
      label: "Overdue follow-ups",
      value: `${leadCounts.overdueFollowUps} overdue${leadCounts.unworked > 0 ? ` · ${leadCounts.unworked} unworked` : ""}`,
      count: leadCounts.overdueFollowUps
    });
  }
  if (staleLeadCount > 0) {
    attention.push({
      href: "/admin/leads?stale=1",
      label: "Stale leads",
      value: `${staleLeadCount} need a touch`,
      count: staleLeadCount
    });
  }
  if (amlBlocking > 0) {
    attention.push({
      href: "/admin/aml-checklist",
      label: "AML blocking",
      value: `${amlBlocking} need screening before confirm`,
      count: amlBlocking
    });
  }
  if (!isDemoMode() && !twoFactorEnabled) {
    attention.push({
      href: "/portal/settings",
      label: "Staff 2FA",
      value: "Enroll two-factor authentication",
      count: 1000
    });
  }
  attention.sort((a, b) => b.count - a.count);

  const workspaceGroups = getAdminWorkspaceGroups(staff.role);

  return (
    <div className="admin-page">
      {!twoFactorEnabled ? <TwoFactorOptionalBanner /> : null}
      <AdminPageHeader title={roleHome.title} subtitle={roleHome.subtitle} />

      <section className="stack-4">
        <div className="apply-actions">
          {roleHome.primaryLinks.map((link) => (
            <Link key={link.href} className="btn btn-ghost btn-sm" href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="dash-kpi-grid stack-4">
        <Link className="dash-kpi" href="/admin/investors">
          <span>Investor accounts</span>
          <b>{kpis.investorsInBook}</b>
        </Link>
        <Link className="dash-kpi" href="/admin/leads">
          <span>New leads this week</span>
          <b>{kpis.newLeadsThisWeek}</b>
        </Link>
        <Link className="dash-kpi" href="/admin/investors?kyc=submitted">
          <span>Identity checks</span>
          <b>{kpis.pendingKyc}</b>
          <small>Submitted or under review</small>
        </Link>
        <Link className="dash-kpi" href="/admin/distributions">
          <span>Payments due</span>
          <b>{kpis.scheduledDistributions}</b>
          <small>Scheduled payments</small>
        </Link>
      </div>

      <section className="stack-6">
        <h2 className="admin-section-title">Needs attention</h2>
        {attention.length === 0 ? (
          <p className="field-hint">All clear — nothing needs action in your book.</p>
        ) : (
          <div className="admin-hub-grid">
            {attention.map((item) => (
              <Link
                key={item.label}
                className="admin-hub-card admin-hub-card-attention"
                href={item.href}
              >
                <span className="admin-hub-k">{item.label}</span>
                <span className="admin-hub-v">{item.value}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="stack-6" aria-labelledby="admin-workspaces-title">
        <div className="admin-section-heading">
          <div>
            <h2 id="admin-workspaces-title" className="admin-section-title">
              Workspaces
            </h2>
            <p>Open a workspace to review records or make changes.</p>
          </div>
        </div>
        <div className="admin-workspace-groups">
          {workspaceGroups.map((group) => (
            <div className="admin-workspace-group" key={group.key}>
              <div className="admin-workspace-group-heading">
                <h3>{group.label}</h3>
                <p>{group.description}</p>
              </div>
              <ul className="admin-goto-list">
                {group.links.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>
                      {item.label}
                      <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="stack-6">
        <h2 className="admin-section-title">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="stack-3">No recent activity in your book yet.</p>
        ) : (
          <ul className="admin-activity-list stack-3">
            {activity.map((event) => {
              const description = describeAuditEvent(event, event.entity);
              const line = (
                <>
                  {event.actorEmail ? (
                    <>
                      <strong>{event.actorEmail}</strong> {description}{" "}
                    </>
                  ) : (
                    <strong>{description.charAt(0).toUpperCase() + description.slice(1)}</strong>
                  )}{" "}
                  <time dateTime={event.createdAt.toISOString()}>
                    {formatRelativeTime(event.createdAt)}
                  </time>
                </>
              );
              return (
                <li key={event.id}>
                  {event.href ? <Link href={event.href}>{line}</Link> : line}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

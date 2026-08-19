import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { LeadsPagination } from "@/components/admin/leads-pagination";
import { AssignInvestorForm } from "@/components/assign-investor-form";
import { setInvestorPoolAccess } from "@/lib/investors/admin-actions";
import { getStaffContext } from "@/lib/auth/staff";
import { formatApplicationAge, isApplicationOverSla } from "@/lib/apply/sla";
import { INVITE_SLA_COPY } from "@/lib/copy/posture";
import {
  ACCOUNT_STATUS_LABEL,
  APPLICATION_STATUS_LABEL,
  KYC_STATUS_LABEL
} from "@/lib/portal/labels";
import {
  listAgents,
  listInvestorsForStaff,
  type InvestorRow
} from "@/lib/investors/queries";
import {
  INVESTORS_PAGE_SIZE,
  paginateRows,
  searchInvestorRows
} from "@/lib/investors/list-search";

export const dynamic = "force-dynamic";

function label(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

type SearchParams = Promise<{
  filter?: string | string[];
  account?: string | string[];
  application?: string | string[];
  kyc?: string | string[];
  q?: string | string[];
  page?: string | string[];
}>;

function one(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function buildHref(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `/admin/investors?${s}` : "/admin/investors";
}

export default async function AdminInvestorsPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const staff = await getStaffContext();
  if (!staff) redirect("/");

  const params = await searchParams;
  const filter = one(params.filter);
  const account = one(params.account);
  const application = one(params.application);
  const kyc = one(params.kyc);
  const q = (one(params.q) ?? "").trim();
  const requestedPage = Number.parseInt(one(params.page) ?? "1", 10) || 1;
  const unassignedOnly = filter === "unassigned";
  const pendingQueue = filter === "pending";

  let investors: InvestorRow[];
  let agents: { id: string; email: string }[] = [];
  try {
    investors = await listInvestorsForStaff();
    if (staff.role === "super_admin") {
      agents = await listAgents();
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  let rows = investors;
  if (staff.role === "super_admin" && unassignedOnly) {
    rows = rows.filter((row) => row.assignedAgentId === null);
  }
  if (pendingQueue) {
    rows = rows.filter(
      (row) =>
        row.accountStatus === "pending_access" ||
        row.applicationStatus === "submitted" ||
        row.applicationStatus === "contacted"
    );
    rows = [...rows].sort((a, b) => {
      const at = a.applicationCreatedAt?.getTime() ?? 0;
      const bt = b.applicationCreatedAt?.getTime() ?? 0;
      return at - bt;
    });
  }
  if (account) {
    rows = rows.filter((row) => row.accountStatus === account);
  }
  if (application) {
    rows = rows.filter((row) => row.applicationStatus === application);
  }
  if (kyc) {
    rows = rows.filter((row) => row.kycStatus === kyc);
  }

  const searched = searchInvestorRows(rows, q);
  const paged = paginateRows(searched, requestedPage, INVESTORS_PAGE_SIZE);
  const pageRows = paged.rows;

  const pendingCount = investors.filter(
    (row) =>
      row.accountStatus === "pending_access" ||
      row.applicationStatus === "submitted" ||
      row.applicationStatus === "contacted"
  ).length;
  const unassignedCount = investors.filter((row) => row.assignedAgentId === null).length;
  const overdueCount = pendingQueue
    ? rows.filter(
        (row) => row.applicationCreatedAt && isApplicationOverSla(row.applicationCreatedAt)
      ).length
    : 0;

  const paginationParams: Record<string, string> = {};
  if (pendingQueue) paginationParams.filter = "pending";
  if (unassignedOnly) paginationParams.filter = "unassigned";
  if (account) paginationParams.account = account;
  if (application) paginationParams.application = application;
  if (kyc) paginationParams.kyc = kyc;
  if (q) paginationParams.q = q;

  const sectionTitle = pendingQueue
    ? `Pending applications (${paged.total})`
    : unassignedOnly
      ? `Unassigned investors (${paged.total})`
      : `Investors (${paged.total})`;

  const emptyMessage = q
    ? `No investors match "${q}".`
    : pendingQueue
      ? "No pending applications."
      : unassignedOnly
        ? "No unassigned investors in the pool."
        : "No investors to show.";

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Investors"
        subtitle={
          staff.role === "super_admin"
            ? "Assign investors, review applications, and track KYC."
            : "Investors assigned to your book."
        }
        actions={
          <div className="apply-actions">
            <Link
              className={pendingQueue ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
              href={buildHref({
                filter: pendingQueue ? undefined : "pending",
                account,
                application,
                kyc,
                q: q || undefined
              })}
            >
              Pending applications ({pendingCount})
            </Link>
            {staff.role === "super_admin" ? (
              unassignedOnly ? (
                <Link className="link-arrow" href={buildHref({ q: q || undefined })}>
                  Show all
                </Link>
              ) : (
                <Link
                  className="link-arrow"
                  href={buildHref({ filter: "unassigned", q: q || undefined })}
                >
                  Unassigned ({unassignedCount})
                </Link>
              )
            ) : null}
          </div>
        }
      />

      {pendingQueue ? (
        <p className="field-hint stack-b-4">
          Soft contact SLA: flag at 48 hours (oldest first). {INVITE_SLA_COPY}
          {overdueCount > 0 ? ` ${overdueCount} over contact SLA.` : ""}
        </p>
      ) : null}

      <div className="admin-filter-bar">
        <form className="admin-filter-form" method="get">
          {pendingQueue ? <input type="hidden" name="filter" value="pending" /> : null}
          {unassignedOnly ? <input type="hidden" name="filter" value="unassigned" /> : null}
          <label>
            Search
            <input type="search" name="q" defaultValue={q} placeholder="Name or email" />
          </label>
          <label>
            Account
            <select name="account" defaultValue={account ?? ""}>
              <option value="">Any</option>
              <option value="pending_access">{ACCOUNT_STATUS_LABEL.pending_access}</option>
              <option value="active">{ACCOUNT_STATUS_LABEL.active}</option>
              <option value="suspended">{ACCOUNT_STATUS_LABEL.suspended}</option>
            </select>
          </label>
          <label>
            Application
            <select name="application" defaultValue={application ?? ""}>
              <option value="">Any</option>
              <option value="submitted">{APPLICATION_STATUS_LABEL.submitted}</option>
              <option value="contacted">{APPLICATION_STATUS_LABEL.contacted}</option>
              <option value="approved">{APPLICATION_STATUS_LABEL.approved}</option>
              <option value="rejected">{APPLICATION_STATUS_LABEL.rejected}</option>
            </select>
          </label>
          <label>
            KYC
            <select name="kyc" defaultValue={kyc ?? ""}>
              <option value="">Any</option>
              <option value="not_started">{KYC_STATUS_LABEL.not_started}</option>
              <option value="submitted">{KYC_STATUS_LABEL.submitted}</option>
              <option value="under_review">{KYC_STATUS_LABEL.under_review}</option>
              <option value="approved">{KYC_STATUS_LABEL.approved}</option>
              <option value="rejected">{KYC_STATUS_LABEL.rejected}</option>
            </select>
          </label>
          <button type="submit" className="btn btn-ghost btn-sm">
            Apply filters
          </button>
        </form>
      </div>

      <AdminSection title={sectionTitle}>
        {pageRows.length === 0 ? (
          <div className="empty-state">
            <h2 className="h3">Nothing here</h2>
            <p className="lead">{emptyMessage}</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="admin-table investors-table">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col" className="investors-col-secondary">Name</th>
                    <th scope="col" className="investors-col-secondary">Assigned agent</th>
                    {pendingQueue ? <th scope="col">Age</th> : null}
                    <th scope="col">Account</th>
                    {staff.role === "super_admin" ? <th scope="col">Investment access</th> : null}
                    <th scope="col" className="investors-col-secondary">Application</th>
                    <th scope="col">KYC</th>
                    {staff.role === "super_admin" ? <th scope="col">Assign</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((investor) => {
                    const detailHref = pendingQueue
                      ? `/admin/investors/${investor.id}?tab=application`
                      : `/admin/investors/${investor.id}`;
                    const overSla =
                      Boolean(pendingQueue) &&
                      Boolean(investor.applicationCreatedAt) &&
                      isApplicationOverSla(investor.applicationCreatedAt!);
                    return (
                      <tr key={investor.id} className={overSla ? "is-over-sla" : undefined}>
                        <td className="cell-email" title={investor.email} data-label="Email">
                          <Link href={detailHref}>{investor.email}</Link>
                        </td>
                        <td className="investors-col-secondary" data-label="Name">
                          {investor.fullName ? (
                            <Link href={detailHref}>{investor.fullName}</Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="investors-col-secondary" data-label="Assigned agent">
                          {investor.assignedAgentEmail ?? (
                            <span className="field-hint">Unassigned</span>
                          )}
                        </td>
                        {pendingQueue ? (
                          <td data-label="Age">
                            {investor.applicationCreatedAt
                              ? formatApplicationAge(investor.applicationCreatedAt)
                              : "—"}
                            {overSla ? " · over SLA" : ""}
                          </td>
                        ) : null}
                        <td data-label="Account">
                          {label(ACCOUNT_STATUS_LABEL, investor.accountStatus)}
                        </td>
                        {staff.role === "super_admin" ? (
                          <td data-label="Investment access">
                            <form action={setInvestorPoolAccess} className="admin-inline-form">
                              <input type="hidden" name="investorId" value={investor.id} />
                              <input
                                type="hidden"
                                name="enabled"
                                value={investor.poolInvestmentsEnabled ? "false" : "true"}
                              />
                              <span className={investor.poolInvestmentsEnabled ? "badge badge-status-confirmed" : "badge badge-status-closed"}>
                                {investor.poolInvestmentsEnabled ? "Enabled" : "Disabled"}
                              </span>
                              <button type="submit" className="btn btn-ghost btn-sm">
                                {investor.poolInvestmentsEnabled ? "Deactivate" : "Activate"}
                              </button>
                            </form>
                          </td>
                        ) : null}
                        <td className="investors-col-secondary" data-label="Application">
                          {investor.applicationStatus
                            ? label(APPLICATION_STATUS_LABEL, investor.applicationStatus)
                            : "—"}
                        </td>
                        <td data-label="KYC">{label(KYC_STATUS_LABEL, investor.kycStatus)}</td>
                        {staff.role === "super_admin" ? (
                          <td data-label="Assign">
                            <AssignInvestorForm
                              key={`${investor.id}:${investor.assignedAgentId ?? "pool"}`}
                              investorId={investor.id}
                              agents={agents}
                              currentAgentStaffId={investor.assignedAgentId}
                              investorLabel={investor.email}
                            />
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <LeadsPagination
              basePath="/admin/investors"
              params={paginationParams}
              pageParam="page"
              page={paged.page}
              total={paged.total}
              pageSize={INVESTORS_PAGE_SIZE}
              itemLabel="investors"
            />
          </>
        )}
      </AdminSection>
    </div>
  );
}

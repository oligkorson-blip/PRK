import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { LeadsPagination } from "@/components/admin/leads-pagination";
import { LeadsSearchForm } from "@/components/admin/leads-search-form";
import { CreateLeadListForm } from "@/components/create-lead-list-form";
import { LeadsBulkTable, type BulkLeadRow } from "@/components/leads-bulk-table";
import { getStaffContext } from "@/lib/auth/staff";
import { formatDateDdMmYyyy } from "@/lib/format";
import {
  LEADS_PAGE_SIZE,
  countStaleLeadsForStaff,
  listLeadListsForStaff,
  searchLeadsForStaff,
  type LeadListRow,
  type LeadRow,
  type LeadSearchResult
} from "@/lib/leads/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EMPTY_RESULT: LeadSearchResult = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: LEADS_PAGE_SIZE
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parsePage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function toBulkRow(lead: LeadRow): BulkLeadRow {
  return {
    id: lead.id,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    sourceDetail: lead.sourceDetail,
    status: lead.status,
    assignedAgentEmail: lead.assignedAgentEmail,
    investorId: lead.investorId,
    lastActivityAt: lead.lastActivityAt ? lead.lastActivityAt.toISOString() : null
  };
}

export default async function AdminLeadsPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const staff = await getStaffContext();
  if (!staff) redirect("/");

  const raw = await searchParams;
  const q = first(raw.q).trim();
  const status = first(raw.status).trim();
  // Deep-links from the dashboard cards (stale leads / awaiting assignment).
  const stale = first(raw.stale) === "1";
  const unassigned = first(raw.unassigned) === "1";
  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (status) baseParams.status = status;
  if (stale) baseParams.stale = "1";
  if (unassigned) baseParams.unassigned = "1";

  const isSuper = staff.role === "super_admin";
  const isIb = staff.role === "ib";

  let lists: LeadListRow[] = [];
  let allLeads = EMPTY_RESULT;
  let queueLeads = EMPTY_RESULT;
  let teamLeads = EMPTY_RESULT;
  let allStale = 0;
  let queueStale = 0;
  let teamStale = 0;
  const staleScopeLabel = q || status || stale || unassigned ? "book-wide stale" : "stale";
  try {
    if (isSuper) {
      [lists, allLeads, allStale] = await Promise.all([
        listLeadListsForStaff(),
        searchLeadsForStaff({ q, status, page: parsePage(first(raw.page)), stale, unassigned }),
        countStaleLeadsForStaff()
      ]);
    } else if (isIb) {
      [queueLeads, teamLeads, queueStale, teamStale] = await Promise.all([
        searchLeadsForStaff({
          q,
          status,
          page: parsePage(first(raw.qp)),
          assignment: "unassigned",
          stale
        }),
        searchLeadsForStaff({
          q,
          status,
          page: parsePage(first(raw.tp)),
          assignment: "assigned",
          stale
        }),
        countStaleLeadsForStaff({ assignment: "unassigned" }),
        countStaleLeadsForStaff({ assignment: "assigned" })
      ]);
    } else {
      [allLeads, allStale] = await Promise.all([
        searchLeadsForStaff({ q, status, page: parsePage(first(raw.page)), stale, unassigned }),
        countStaleLeadsForStaff()
      ]);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  // Each section's pagination links preserve the other section's page.
  const queueParams = { ...baseParams };
  if (teamLeads.page > 1) queueParams.tp = String(teamLeads.page);
  const teamParams = { ...baseParams };
  if (queueLeads.page > 1) teamParams.qp = String(queueLeads.page);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Leads"
        subtitle={
          isSuper
            ? "Search, work, and assign your pipeline."
            : isIb
              ? "Your unassigned queue and your team's leads."
              : "Leads assigned to your book."
        }
      />

      {isSuper ? (
        <>
          <AdminSection title={`All leads (${allLeads.total} · ${allStale} ${staleScopeLabel})`}>
            <LeadsSearchForm q={q} status={status} />
            {allLeads.rows.length === 0 ? (
              <p className="lead stack-3">No leads match your search.</p>
            ) : (
              <>
                <div className="stack-3">
                  <LeadsBulkTable rows={allLeads.rows.map(toBulkRow)} />
                </div>
                <LeadsPagination
                  basePath="/admin/leads"
                  params={baseParams}
                  pageParam="page"
                  page={allLeads.page}
                  total={allLeads.total}
                  pageSize={allLeads.pageSize}
                />
              </>
            )}
          </AdminSection>

          <div className="admin-grid-2">
            <AdminSection title="Lead lists">
              {lists.length === 0 ? (
                <p className="lead">No lead lists yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="admin-table admin-stack-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Default source</th>
                      <th scope="col">Created</th>
                      <th scope="col" aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lists.map((list) => (
                      <tr key={list.id}>
                        <td data-label="Name">{list.name}</td>
                        <td data-label="Default source">{list.defaultSource || "—"}</td>
                        <td data-label="Created">{formatDateDdMmYyyy(list.createdAt)}</td>
                        <td data-label="Open">
                          <Link className="link-arrow" href={`/admin/leads/${list.id}`} aria-label={`Open ${list.name}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </AdminSection>

            <AdminSection title="Create list">
              <CreateLeadListForm />
              <p className="field-hint stack-3">
                Working from a spreadsheet?{" "}
                <a className="link-arrow" href="/admin/leads/template">
                  Download the CSV template
                </a>
              </p>
            </AdminSection>
          </div>
        </>
      ) : isIb ? (
        <>
          <AdminSection title={`Unassigned leads (${queueLeads.total} · ${queueStale} ${staleScopeLabel})`}>
            <LeadsSearchForm q={q} status={status} />
            {queueLeads.rows.length === 0 ? (
              <p className="lead stack-3">Your queue is empty.</p>
            ) : (
              <>
                <div className="stack-3">
                  <LeadsBulkTable rows={queueLeads.rows.map(toBulkRow)} />
                </div>
                <LeadsPagination
                  basePath="/admin/leads"
                  params={queueParams}
                  pageParam="qp"
                  page={queueLeads.page}
                  total={queueLeads.total}
                  pageSize={queueLeads.pageSize}
                />
              </>
            )}
          </AdminSection>

          <AdminSection title={`Team leads (${teamLeads.total} · ${teamStale} ${staleScopeLabel})`}>
            {teamLeads.rows.length === 0 ? (
              <p className="lead">No leads assigned to your agents yet.</p>
            ) : (
              <>
                <LeadsBulkTable rows={teamLeads.rows.map(toBulkRow)} />
                <LeadsPagination
                  basePath="/admin/leads"
                  params={teamParams}
                  pageParam="tp"
                  page={teamLeads.page}
                  total={teamLeads.total}
                  pageSize={teamLeads.pageSize}
                />
              </>
            )}
          </AdminSection>
        </>
      ) : (
        <AdminSection title={`Assigned leads (${allLeads.total} · ${allStale} ${staleScopeLabel})`}>
          <LeadsSearchForm q={q} status={status} />
          {allLeads.rows.length === 0 ? (
            <p className="lead stack-3">No leads assigned to you.</p>
          ) : (
            <>
              <div className="stack-3">
                <LeadsBulkTable rows={allLeads.rows.map(toBulkRow)} />
              </div>
              <LeadsPagination
                basePath="/admin/leads"
                params={baseParams}
                pageParam="page"
                page={allLeads.page}
                total={allLeads.total}
                pageSize={allLeads.pageSize}
              />
            </>
          )}
        </AdminSection>
      )}
    </div>
  );
}

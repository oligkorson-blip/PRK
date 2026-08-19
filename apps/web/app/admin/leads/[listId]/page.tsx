import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { LeadsPagination } from "@/components/admin/leads-pagination";
import { LeadsSearchForm } from "@/components/admin/leads-search-form";
import { AssignAllLeadsForm } from "@/components/assign-lead-form";
import { LeadUploadForm } from "@/components/lead-upload-form";
import { LeadsBulkTable, type BulkLeadRow } from "@/components/leads-bulk-table";
import { getStaffContext } from "@/lib/auth/staff";
import { isUuid } from "@/lib/format";
import { listAgents } from "@/lib/investors/queries";
import {
  LEADS_PAGE_SIZE,
  listIbsWithWorkload,
  listLeadListsForStaff,
  searchLeadsForStaff,
  type LeadRow,
  type LeadSearchResult
} from "@/lib/leads/queries";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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

export default async function AdminLeadListPage({ params, searchParams }: Params) {
  const staff = await getStaffContext();
  if (!staff) redirect("/");

  const { listId } = await params;
  if (!isUuid(listId)) notFound();
  const isSuper = staff.role === "super_admin";
  const isIb = staff.role === "ib";

  const raw = await searchParams;
  const q = first(raw.q).trim();
  const status = first(raw.status).trim();
  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (status) baseParams.status = status;

  let lists;
  let result = EMPTY_RESULT;
  let agents: { id: string; email: string; ibId?: string | null; ibEmail?: string | null }[] = [];
  let ibs: { id: string; email: string }[] = [];
  let assignmentLeadCount = 0;
  try {
    lists = await listLeadListsForStaff();
    result = await searchLeadsForStaff({
      q,
      status,
      page: parsePage(first(raw.page)),
      listId
    });
    if (isSuper) {
      const [agentRows, ibRows, unfilteredResult] = await Promise.all([
        listAgents(),
        listIbsWithWorkload(),
        q || status
          ? searchLeadsForStaff({ q: "", status: "", page: 1, listId })
          : Promise.resolve(result)
      ]);
      agents = agentRows;
      ibs = ibRows.map((ib) => ({ id: ib.id, email: ib.email }));
      assignmentLeadCount = unfilteredResult.total;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  const list = lists.find((row) => row.id === listId);
  if (!list) {
    notFound();
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title={list.name}
        subtitle={
          <>
            Default source: {list.defaultSource || "—"} · {result.total} lead
            {result.total === 1 ? "" : "s"}
            {isSuper
              ? ". Upload CSV rows, review import errors, and assign leads to IBs or agents."
              : isIb
                ? ". Your team's leads in this list."
                : ". Showing leads assigned to you in this list."}
          </>
        }
        actions={
          <Link className="link-arrow" href="/admin/leads">
            All leads
          </Link>
        }
      />

      {isSuper ? (
        <>
          <AdminSection title="Upload CSV">
            <p>
              <a className="link-arrow" href="/admin/leads/template">
                Download CSV template
              </a>
            </p>
            <LeadUploadForm listId={list.id} />
          </AdminSection>

          <AdminSection title="Assign all">
            <AssignAllLeadsForm
              listId={list.id}
              agents={agents}
              ibs={ibs}
              leadCount={assignmentLeadCount}
            />
          </AdminSection>
        </>
      ) : null}

      <AdminSection title={`Leads (${result.total})`}>
        <LeadsSearchForm q={q} status={status} action={`/admin/leads/${list.id}`} />
        {result.rows.length === 0 ? (
          <p className="lead stack-3">
            {q || status
              ? "No leads match your search."
              : isSuper
                ? "No leads in this list yet."
                : "No leads assigned to you in this list."}
          </p>
        ) : (
          <>
            <div className="stack-3">
              <LeadsBulkTable rows={result.rows.map(toBulkRow)} />
            </div>
            <LeadsPagination
              basePath={`/admin/leads/${list.id}`}
              params={baseParams}
              pageParam="page"
              page={result.page}
              total={result.total}
              pageSize={result.pageSize}
            />
          </>
        )}
      </AdminSection>
    </div>
  );
}

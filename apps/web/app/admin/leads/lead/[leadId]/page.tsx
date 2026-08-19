import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { LeadDetailsForm } from "@/components/lead-details-form";
import { LeadStageSelect } from "@/components/lead-stage-select";
import { LogCallForm } from "@/components/log-call-form";
import { PersonAccessPanel } from "@/components/person-access-panel";
import { LeadAssignmentPanel } from "@/components/lead-assignment-panel";
import { LeadFollowUpForm } from "@/components/lead-followup-form";
import { ConvertLeadButton } from "@/components/convert-lead-button";
import {
  getInvestorDetailForStaff,
  listAccessEventsForAuthUser,
  type AccessEventRow
} from "@/lib/access/queries";
import { getStaffContext } from "@/lib/auth/staff";
import { isUuid, formatDateDdMmYyyy, formatDateTimeUtc } from "@/lib/format";
import {
  getLeadAssignmentHistory,
  getLeadForStaff,
  listAgentsWithWorkload,
  listCallAttemptsForLead,
  listIbsWithWorkload,
  type AttemptRow,
  type LeadAssignmentHistoryRow,
  type LeadRow
} from "@/lib/leads/queries";
import { leadCallOutcomeLabel } from "@/lib/leads/outcomes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ leadId: string }> };

function formatCalledAt(value: Date): string {
  return formatDateTimeUtc(value);
}

function formatDateTime(value: Date | null): string {
  return value ? formatDateTimeUtc(value) : "—";
}

function assignmentActionLabel(row: LeadAssignmentHistoryRow): string {
  switch (row.action) {
    case "assign_ib":
      return "Assigned to IB";
    case "reassign_ib":
      return "Moved to another IB";
    case "assign_agent":
      return "Assigned to agent";
    case "reassign_agent":
      return "Reassigned to another agent";
    case "remove_agent":
      return "Agent removed";
    case "remove_all":
      return "All assignment removed";
    case "return_to_ib_queue":
      return "Returned to IB queue";
    default:
      return row.action;
  }
}

function assignmentTarget(row: LeadAssignmentHistoryRow): string {
  const bits: string[] = [];
  if (row.toIbEmail) bits.push(`IB: ${row.toIbEmail}`);
  if (row.toAgentEmail) bits.push(`Agent: ${row.toAgentEmail}`);
  return bits.length > 0 ? bits.join(" · ") : "—";
}

export default async function AdminLeadDetailPage({ params }: Params) {
  const staff = await getStaffContext();
  if (!staff) redirect("/");

  const { leadId } = await params;
  if (!isUuid(leadId)) notFound();

  let lead: LeadRow | undefined;
  let attempts: AttemptRow[] = [];
  let accessEvents: AccessEventRow[] = [];
  let history: LeadAssignmentHistoryRow[] = [];
  let linkedInvestorOutOfScope = false;
  try {
    lead = await getLeadForStaff(leadId);
    attempts = await listCallAttemptsForLead(leadId);
    history = await getLeadAssignmentHistory(leadId);
    if (lead.investorId) {
      try {
        const investor = await getInvestorDetailForStaff(lead.investorId);
        accessEvents = investor.authUserId
          ? await listAccessEventsForAuthUser(investor.authUserId)
          : [];
      } catch (error) {
        // A linked investor outside this staff member's book must not
        // 404 the whole lead page.
        if (error instanceof Error && error.message === "NOT_FOUND") {
          linkedInvestorOutOfScope = true;
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  }

  if (!lead) notFound();

  const canAssign = staff.role === "super_admin" || staff.role === "ib";
  // A failed workload query falls back to an empty dropdown, but log it so a
  // DB outage is distinguishable from "no staff exist".
  const ibs =
    staff.role === "super_admin"
      ? await listIbsWithWorkload().catch((error) => {
          console.error("[leads:workload]", error);
          return [];
        })
      : [];
  const agents = canAssign
    ? await listAgentsWithWorkload().catch((error) => {
        console.error("[leads:workload]", error);
        return [];
      })
    : [];

  return (
    <div className="admin-page">
      <AdminPageHeader
        title={lead.fullName}
        subtitle={`${lead.source}${lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""} · added ${formatDateDdMmYyyy(lead.createdAt)}`}
        actions={
          <Link className="link-arrow" href="/admin/leads">
            Back to leads
          </Link>
        }
      />

      <div className="lead-identity">
        <LeadStageSelect leadId={lead.id} status={lead.status} />
        {lead.investorId ? (
          <Link className="stage-pill stage-pill-converted" href={`/admin/investors/${lead.investorId}`}>
            Investor →
          </Link>
        ) : (
          <ConvertLeadButton leadId={lead.id} />
        )}
        {lead.nextFollowUpAt ? (
          <span className="field-hint">
            Follow-up {formatDateTimeUtc(lead.nextFollowUpAt)}
          </span>
        ) : null}
      </div>

      <div className="lead-detail-grid">
        <div className="lead-detail-main">
          <AdminSection title="Log call">
            <LogCallForm leadId={lead.id} />
          </AdminSection>

          <AdminSection title="Call history">
            {attempts.length === 0 ? (
              <p className="lead">No calls logged yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table admin-stack-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">Agent</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="leads-nowrap" data-label="When">
                        {formatCalledAt(attempt.calledAt)}
                      </td>
                      <td data-label="Outcome">{leadCallOutcomeLabel(attempt.outcome)}</td>
                      <td data-label="Agent">{attempt.agentEmail ?? "—"}</td>
                      <td data-label="Notes">{attempt.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </AdminSection>

          <AdminSection title="Assignment history">
            {history.length === 0 ? (
              <p className="lead">No assignments recorded yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table admin-stack-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Action</th>
                    <th scope="col">Target</th>
                    <th scope="col">By</th>
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td className="leads-nowrap" data-label="When">
                        {formatCalledAt(row.createdAt)}
                      </td>
                      <td data-label="Action">{assignmentActionLabel(row)}</td>
                      <td data-label="Target">{assignmentTarget(row)}</td>
                      <td data-label="By">{row.actorEmail ?? "system"}</td>
                      <td data-label="Note">{row.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </AdminSection>

          {lead.investorId ? (
            linkedInvestorOutOfScope ? (
              <AdminSection title="Linked investor">
                <p className="lead">The investor linked to this lead is outside your book.</p>
              </AdminSection>
            ) : (
              <PersonAccessPanel events={accessEvents} />
            )
          ) : null}
        </div>

        <div className="lead-detail-side">
          <AdminSection title="Details">
            <LeadDetailsForm
              leadId={lead.id}
              fullName={lead.fullName}
              email={lead.email}
              phone={lead.phone}
              notes={lead.notes}
            />
          </AdminSection>

          <AdminSection title="Ownership">
            <dl className="lead-facts">
              <div>
                <dt>Parent IB</dt>
                <dd>{lead.ibEmail ?? "—"}</dd>
              </div>
              <div>
                <dt>Agent</dt>
                <dd>{lead.assignedAgentEmail ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt>Assigned by</dt>
                <dd>{lead.assignedByEmail ?? "—"}</dd>
              </div>
              <div>
                <dt>Assigned on</dt>
                <dd>{formatDateTime(lead.assignedAt)}</dd>
              </div>
            </dl>
            {canAssign ? (
              <div className="stack-4">
                <LeadAssignmentPanel
                  role={staff.role as "super_admin" | "ib"}
                  leadId={lead.id}
                  currentIbId={lead.ibId}
                  currentAgentId={lead.assignedAgentId}
                  ibs={ibs}
                  agents={agents}
                />
              </div>
            ) : null}
          </AdminSection>

          <AdminSection title="Follow-up">
            <LeadFollowUpForm leadId={lead.id} nextFollowUpAt={lead.nextFollowUpAt} />
            <p className="field-hint stack-3">
              Last activity {formatDateTime(lead.lastActivityAt)}
            </p>
          </AdminSection>
        </div>
      </div>
    </div>
  );
}

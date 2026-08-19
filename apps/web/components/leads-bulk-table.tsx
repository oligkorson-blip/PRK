"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { LeadStageSelect } from "@/components/lead-stage-select";
import { bulkSetLeadStatus } from "@/lib/leads/assign/bulk-status";
import { isStaleLead } from "@/lib/leads/stale";
import { formatDateDdMmYyyy } from "@/lib/format";

/** Serializable row shape — server pages map LeadRow → BulkLeadRow (ISO dates). */
export type BulkLeadRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  source: string;
  sourceDetail: string | null;
  status: string;
  assignedAgentEmail: string | null;
  investorId: string | null;
  lastActivityAt: string | null;
};

const BULK_ACTIONS = [
  { status: "contacted", label: "Mark contacted" },
  { status: "qualified", label: "Mark qualified" },
  { status: "unqualified", label: "Mark unqualified" }
] as const;

/** Absolute date for SSR — DD-MM-YYYY so it matches platform display format. */
function absoluteDateFromIso(iso: string): string {
  return formatDateDdMmYyyy(iso);
}

/** Client-local relative time ("just now", "3h ago", "12d ago", or a date). */
function relativeTime(then: Date, now: Date): string {
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return absoluteDateFromIso(then.toISOString());
}

function LastActivityCell({ iso }: { iso: string | null }) {
  const [label, setLabel] = useState(() => (iso ? absoluteDateFromIso(iso) : null));

  useEffect(() => {
    if (!iso) {
      setLabel(null);
      return;
    }
    setLabel(relativeTime(new Date(iso), new Date()));
  }, [iso]);

  if (!iso) {
    return <span title="No activity yet">Never</span>;
  }
  return <span title={absoluteDateFromIso(iso)}>{label}</span>;
}

export function LeadsBulkTable({ rows }: { rows: BulkLeadRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<{ leadId: string; error: string }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const rowSignature = rows.map((row) => row.id).join("|");

  useEffect(() => {
    if (isPending) return;
    if (formError || message) {
      feedbackRef.current?.focus();
    }
  }, [formError, isPending, message]);

  useEffect(() => {
    setSelected(new Set());
    setRowErrors([]);
    setFormError(null);
    setMessage(null);
  }, [rowSignature]);

  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map((row) => row.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function runBulk(status: string) {
    setFormError(null);
    setMessage(null);
    setRowErrors([]);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof bulkSetLeadStatus>>;
      try {
        result = await bulkSetLeadStatus({ leadIds: [...selected], status });
      } catch {
        setFormError("Something went wrong. Please try again.");
        return;
      }
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      // Partial success: keep the failed rows selected so the user can retry
      // or open them; refreshed rows clear their checkboxes.
      setRowErrors(result.failed);
      setSelected(new Set(result.failed.map((failure) => failure.leadId)));
      if (result.failed.length > 0) {
        setMessage(
          result.updated > 0
            ? `Updated ${result.updated} lead${result.updated === 1 ? "" : "s"}. ${result.failed.length} could not be updated; those leads remain selected so you can retry.`
            : `No leads were updated. ${result.failed.length} could not be updated; those leads remain selected so you can retry.`
        );
      } else {
        setMessage(`Updated ${result.updated} lead${result.updated === 1 ? "" : "s"}.`);
      }
      if (result.updated > 0) router.refresh();
    });
  }

  const errorFor = (id: string) => rowErrors.find((entry) => entry.leadId === id)?.error;

  return (
    <>
      <div className="table-wrap">
        <table className="admin-table leads-table">
          <thead>
            <tr>
              <th scope="col" className="leads-col-check">
                <input
                  type="checkbox"
                  aria-label="Select all leads on this page"
                  checked={allChecked}
                  onChange={toggleAll}
                />
              </th>
              <th scope="col">Lead</th>
              <th scope="col">Stage</th>
              <th scope="col" className="leads-col-mobilehide">Agent</th>
              <th scope="col" className="leads-col-wide">Source</th>
              <th scope="col" className="leads-col-wide">Linked</th>
              <th scope="col" className="leads-col-mobilehide">Last activity</th>
              <th scope="col" aria-label="Open lead" />
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => {
              const stale = isStaleLead({
                status: lead.status,
                lastActivityAt: lead.lastActivityAt ? new Date(lead.lastActivityAt) : null
              });
              const href = `/admin/leads/lead/${lead.id}`;
              return (
                <tr
                  key={lead.id}
                  className="leads-row"
                >
                  <td className="leads-col-check">
                    <input
                      type="checkbox"
                      aria-label={`Select ${lead.fullName}`}
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                    />
                  </td>
                  <td className="lead-cell">
                    <Link className="lead-row-link" href={href}>
                      <strong>{lead.fullName}</strong>
                      <span className="lead-email">{lead.email}</span>
                    </Link>
                    {errorFor(lead.id) ? (
                      <p className="form-error" role="alert">
                        {errorFor(lead.id)}
                      </p>
                    ) : null}
                  </td>
                  <td className="leads-nowrap">
                    <LeadStageSelect
                      leadId={lead.id}
                      status={lead.status}
                      label={`Stage for ${lead.fullName}`}
                    />
                    {stale ? <span className="badge badge-stale">Stale</span> : null}
                  </td>
                  <td className="leads-nowrap leads-col-mobilehide">
                    {lead.assignedAgentEmail ?? <span className="leads-muted">Unassigned</span>}
                  </td>
                  <td className="leads-col-wide leads-muted">
                    {lead.source}
                    {lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}
                  </td>
                  <td className="leads-col-wide leads-muted">
                    {lead.investorId ? "Yes" : "No"}
                  </td>
                  <td className="leads-nowrap leads-muted leads-col-mobilehide">
                    <LastActivityCell iso={lead.lastActivityAt} />
                  </td>
                  <td className="leads-col-open">
                    <Link className="leads-open-link" href={href} aria-label={`Open ${lead.fullName}`}>
                      <span className="leads-chevron" aria-hidden="true">→</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {formError ? (
        <p ref={feedbackRef} className="form-error" role="alert" tabIndex={-1}>
          {formError}
        </p>
      ) : null}
      {message ? (
        <p
          ref={feedbackRef}
          className="field-hint"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          {message}
        </p>
      ) : null}
      {selected.size > 0 ? (
        <div className="bulk-bar">
          <span>{selected.size} selected</span>
          {BULK_ACTIONS.map((action) => (
            <button
              key={action.status}
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={isPending}
              onClick={() => runBulk(action.status)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignLeadToAgent,
  assignLeadToIb,
  removeLeadAgent,
  removeLeadAssignment
} from "@/lib/leads/assign/assign";
import type { AgentWorkloadRow, IbWorkloadRow } from "@/lib/leads/queries";

function workloadLabel(agent: AgentWorkloadRow): string {
  const parts = [`${agent.activeLeadCount} active`];
  if (agent.overdueCount > 0) parts.push(`${agent.overdueCount} overdue`);
  return parts.join(" · ");
}

export function LeadAssignmentPanel({
  role,
  leadId,
  currentIbId,
  currentAgentId,
  ibs,
  agents
}: {
  role: "super_admin" | "ib";
  leadId: string;
  currentIbId: string | null;
  currentAgentId: string | null;
  ibs: IbWorkloadRow[];
  agents: AgentWorkloadRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [ibChoice, setIbChoice] = useState("");
  const [agentIbFilter, setAgentIbFilter] = useState(currentIbId ?? "");
  const [agentChoice, setAgentChoice] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!isPending && error) errorRef.current?.focus();
  }, [error, isPending]);

  const filteredAgents = useMemo(() => {
    if (role === "ib") return agents;
    if (!agentIbFilter) return agents;
    return agents.filter((agent) => agent.ibId === agentIbFilter);
  }, [role, agents, agentIbFilter]);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setIbChoice("");
          setAgentChoice("");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The lead assignment could not be updated. Please try again.");
      }
    });
  }

  return (
    <div className="assignment-panel" aria-busy={isPending}>
      <fieldset className="form-fieldset" disabled={isPending}>
        <legend className="sr-only">Lead assignment</legend>
        {role === "super_admin" ? (
          <div className="assignment-route">
            <h4>Assign to IB</h4>
            <p className="field-hint">
              Sends the lead to the IB&rsquo;s unassigned queue. The IB assigns it to one of their
              agents.
            </p>
            <div className="staff-action-row">
              <select
                aria-label="Select an IB"
                value={ibChoice}
                disabled={isPending}
                onChange={(event) => setIbChoice(event.target.value)}
              >
                <option value="">Select an IB</option>
                {ibs.map((ib) => (
                  <option key={ib.id} value={ib.id}>
                    {ib.email} — {ib.queueCount} in queue · {ib.teamLeadCount} team leads
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isPending || !ibChoice || ibChoice === currentIbId}
                onClick={() => run(() => assignLeadToIb({ leadId, ibStaffId: ibChoice }))}
              >
                Assign to IB
              </button>
            </div>
          </div>
        ) : null}

        <div className="assignment-route">
          <h4>Assign to agent</h4>
          <p className="field-hint">
            {role === "super_admin"
              ? "Assigns directly to an agent. The lead automatically inherits the agent's parent IB."
              : "Assign to an agent on your team."}
          </p>
          {role === "super_admin" && ibs.length > 0 ? (
            <div className="staff-action-row">
              <select
                aria-label="Filter agents by IB"
                value={agentIbFilter}
                disabled={isPending}
                onChange={(event) => {
                  setAgentIbFilter(event.target.value);
                  setAgentChoice("");
                }}
              >
                <option value="">All IBs</option>
                {ibs.map((ib) => (
                  <option key={ib.id} value={ib.id}>
                    {ib.email}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="staff-action-row">
            <select
              aria-label="Select an agent"
              value={agentChoice}
              disabled={isPending}
              onChange={(event) => setAgentChoice(event.target.value)}
            >
              <option value="">Select an agent</option>
              {filteredAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.email}
                  {role === "super_admin" && agent.ibEmail ? ` (${agent.ibEmail})` : ""} —{" "}
                  {workloadLabel(agent)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={isPending || !agentChoice || agentChoice === currentAgentId}
              onClick={() => run(() => assignLeadToAgent({ leadId, agentStaffId: agentChoice }))}
            >
              Assign to agent
            </button>
          </div>
          {filteredAgents.length === 0 ? (
            <p className="field-hint">No agents available for this IB.</p>
          ) : null}
        </div>

        <div className="assignment-route assignment-danger-zone">
          {currentAgentId ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={isPending}
              onClick={() => run(() => removeLeadAgent({ leadId }))}
            >
              Return to IB queue
            </button>
          ) : null}
          {role === "super_admin" && (currentIbId || currentAgentId) ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={isPending}
              onClick={() => {
                if (window.confirm("Remove both the IB and agent assignment for this lead?")) {
                  run(() => removeLeadAssignment({ leadId }));
                }
              }}
            >
              Remove all assignment
            </button>
          ) : null}
        </div>
      </fieldset>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

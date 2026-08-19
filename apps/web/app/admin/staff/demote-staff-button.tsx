"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { demoteAgent, demoteIb } from "@/lib/staff/demote-actions";
import { transferAgentToIb } from "@/lib/staff/transfer-actions";

type AgentOption = { id: string; email: string };
type IbOption = { id: string; email: string };

export function DemoteStaffButton({
  staffId,
  email,
  role,
  teammates,
  ibs
}: {
  staffId: string;
  email: string;
  role: "ib" | "agent";
  /** Other agents on the same team (for lead reassignment). */
  teammates?: AgentOption[];
  /** Other IBs (for agent transfer / IB team reassignment). */
  ibs?: IbOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [strategy, setStrategy] = useState<string>("return_to_ib_queue");
  const [transferIb, setTransferIb] = useState("");
  const [transferStrategy, setTransferStrategy] = useState<"keep_with_original_ib" | "move_with_agent">(
    "keep_with_original_ib"
  );
  const [ibTarget, setIbTarget] = useState("");

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The staff change could not be completed. Please try again.");
      }
    });
  }

  function handleDemoteAgent() {
    const label =
      strategy === "return_to_ib_queue"
        ? "their leads return to the IB's unassigned queue"
        : strategy === "unassign_all"
          ? "their leads become fully unassigned"
          : "their leads are reassigned to the selected agent";
    if (!window.confirm(`Remove staff access for ${email}? ${label}.`)) return;
    run(() =>
      demoteAgent({
        staffId,
        leadStrategy: strategy.startsWith("reassign:")
          ? { reassignToAgentId: strategy.slice("reassign:".length) }
          : (strategy as "return_to_ib_queue" | "unassign_all")
      })
    );
  }

  function handleTransfer() {
    if (!transferIb) return;
    if (
      !window.confirm(
        `Move ${email} to the selected IB? ${
          transferStrategy === "keep_with_original_ib"
            ? "Their leads stay with the original IB."
            : "Their leads move with them."
        }`
      )
    ) {
      return;
    }
    run(() =>
      transferAgentToIb({ agentStaffId: staffId, toIbStaffId: transferIb, leadStrategy: transferStrategy })
    );
  }

  function handleDemoteIb() {
    if (!ibTarget) return;
    if (
      !window.confirm(
        `Remove IB access for ${email}? The whole team (agents, leads, investors) is reassigned to the selected IB. This is logged.`
      )
    ) {
      return;
    }
    run(() => demoteIb({ staffId, teamStrategy: { reassignTeamToIbId: ibTarget } }));
  }

  if (role === "ib") {
    return (
      <div className="staff-action-stack">
        <div className="staff-action-row">
          <select
            aria-label="Reassign team to IB"
            value={ibTarget}
            disabled={isPending}
            onChange={(event) => setIbTarget(event.target.value)}
          >
            <option value="">Reassign team to…</option>
            {(ibs ?? []).map((ib) => (
              <option key={ib.id} value={ib.id}>
                {ib.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={isPending || !ibTarget}
            onClick={handleDemoteIb}
          >
            {isPending ? "Removing…" : "Remove IB"}
          </button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="staff-action-stack">
      <div className="staff-action-row">
        <select
          aria-label="Lead handling on removal"
          value={strategy}
          disabled={isPending}
          onChange={(event) => setStrategy(event.target.value)}
        >
          <option value="return_to_ib_queue">Leads → IB queue</option>
          <option value="unassign_all">Leads → fully unassigned</option>
          {(teammates ?? []).map((agent) => (
            <option key={agent.id} value={`reassign:${agent.id}`}>
              Leads → {agent.email}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={isPending}
          onClick={handleDemoteAgent}
        >
          {isPending ? "Removing…" : "Remove access"}
        </button>
      </div>
      {(ibs ?? []).length > 0 ? (
        <div className="staff-action-row">
          <select
            aria-label="Transfer agent to IB"
            value={transferIb}
            disabled={isPending}
            onChange={(event) => setTransferIb(event.target.value)}
          >
            <option value="">Transfer to IB…</option>
            {(ibs ?? []).map((ib) => (
              <option key={ib.id} value={ib.id}>
                {ib.email}
              </option>
            ))}
          </select>
          <select
            aria-label="Lead handling on transfer"
            value={transferStrategy}
            disabled={isPending}
            onChange={(event) =>
              setTransferStrategy(event.target.value as "keep_with_original_ib" | "move_with_agent")
            }
          >
            <option value="keep_with_original_ib">Leads stay</option>
            <option value="move_with_agent">Leads move</option>
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={isPending || !transferIb}
            onClick={handleTransfer}
          >
            Transfer
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

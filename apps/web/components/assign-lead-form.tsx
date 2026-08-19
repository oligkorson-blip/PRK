"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { assignAllLeadsInList, assignLead } from "@/lib/leads/admin-actions";

type AgentOption = { id: string; email: string; ibEmail?: string | null };
type IbOption = { id: string; email: string };

export function AssignLeadForm({
  leadId,
  agents,
  currentAgentStaffId
}: {
  leadId: string;
  agents: AgentOption[];
  currentAgentStaffId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentAgentStaffId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (message) {
      messageRef.current?.focus();
    }
  }, [error, isPending, message]);

  function handleChange(next: string) {
    setValue(next);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await assignLead({
          leadId,
          agentStaffId: next === "" ? null : next
        });
        if (result.ok) {
          setMessage("Lead assignment updated.");
          router.refresh();
        } else {
          setError(result.error);
          setValue(currentAgentStaffId ?? "");
        }
      } catch {
        setError("The lead assignment could not be updated. Please try again.");
        setValue(currentAgentStaffId ?? "");
      }
    });
  }

  return (
    <div className="assign-investor-form">
      <select
        aria-label="Assign agent"
        value={value}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.email}
            {agent.ibEmail ? ` (${agent.ibEmail})` : ""}
          </option>
        ))}
      </select>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          ref={messageRef}
          className="field-hint"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function AssignAllLeadsForm({
  listId,
  agents,
  ibs,
  leadCount
}: {
  listId: string;
  agents: AgentOption[];
  ibs: IbOption[];
  /** Total leads the bulk action will touch — shown in the confirm dialog. */
  leadCount: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (success) {
      successRef.current?.focus();
    }
  }, [error, isPending, success]);

  function selectedLabel(): string {
    if (value.startsWith("ib:")) {
      return ibs.find((ib) => ib.id === value.slice(3))?.email ?? "the selected IB";
    }
    return agents.find((agent) => agent.id === value)?.email ?? "the selected agent";
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const leadsLabel = `${leadCount} lead${leadCount === 1 ? "" : "s"}`;
    const confirmed =
      value === ""
        ? window.confirm(
            `Remove all assignments from all ${leadsLabel} in this list? They return to the pool.`
          )
        : window.confirm(
            `Assign all ${leadsLabel} in this list to ${selectedLabel()}? This overwrites current assignments.`
          );
    if (!confirmed) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await assignAllLeadsInList(
          value === ""
            ? { listId, unassignAll: true }
            : value.startsWith("ib:")
              ? { listId, ibStaffId: value.slice(3) }
              : { listId, agentStaffId: value }
        );
        if (result.ok) {
          setSuccess(
            value === ""
              ? "All leads in this list are now unassigned."
              : "All leads in this list were assigned."
          );
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The list assignments could not be updated. Please try again.");
      }
    });
  }

  return (
    <form className="onboarding-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Assign all leads to</span>
        <select
          aria-label="Assign all leads"
          value={value}
          disabled={isPending}
          onChange={(event) => setValue(event.target.value)}
        >
          <option value="">Unassigned (remove all)</option>
          <optgroup label="IB queue">
            {ibs.map((ib) => (
              <option key={ib.id} value={`ib:${ib.id}`}>
                {ib.email}
              </option>
            ))}
          </optgroup>
          <optgroup label="Direct to agent">
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.email}
                {agent.ibEmail ? ` (${agent.ibEmail})` : ""}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Assigning…" : "Assign all"}
      </button>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          ref={successRef}
          className="lead"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          {success}
        </p>
      ) : null}
    </form>
  );
}

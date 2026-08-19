"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignInvestor } from "@/lib/investors/admin-actions";

type AgentOption = { id: string; email: string };

export function AssignInvestorForm({
  investorId,
  agents,
  currentAgentStaffId,
  investorLabel
}: {
  investorId: string;
  agents: AgentOption[];
  currentAgentStaffId: string | null;
  investorLabel?: string;
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
        const result = await assignInvestor({
          investorId,
          agentStaffId: next === "" ? null : next
        });
        if (result.ok) {
          setMessage("Assignment updated.");
          router.refresh();
        } else {
          setError(result.error);
          setValue(currentAgentStaffId ?? "");
        }
      } catch {
        setError("The assignment could not be updated. Please try again.");
        setValue(currentAgentStaffId ?? "");
      }
    });
  }

  return (
    <div className="assign-investor-form">
      <select
        aria-label={`Assign agent for ${investorLabel ?? "investor"}`}
        value={value}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
      >
        <option value="">Unassigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.email}
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

"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { promoteToAgent } from "@/lib/staff/promote-actions";

export function PromoteAgentForm({ ibs }: { ibs: { id: string; email: string }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [ibStaffId, setIbStaffId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const nextEmail = email.trim();
    startTransition(async () => {
      try {
        const result = await promoteToAgent({ email: nextEmail, ibStaffId });
        if (result.ok) {
          setEmail("");
          setIbStaffId("");
          setSuccess(`Promoted ${nextEmail} to agent.`);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The agent could not be promoted. Please try again.");
      }
    });
  }

  return (
    <form className="onboarding-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Agent email</span>
        <input
          type="email"
          name="email"
          required
          value={email}
          disabled={isPending}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="agent@example.com"
          autoComplete="off"
        />
      </label>
      <label className="form-field">
        <span>Parent IB</span>
        <select
          name="ibStaffId"
          required
          value={ibStaffId}
          disabled={isPending}
          onChange={(event) => setIbStaffId(event.target.value)}
        >
          <option value="" disabled>
            Select an IB
          </option>
          {ibs.map((ib) => (
            <option key={ib.id} value={ib.id}>
              {ib.email}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Promoting…" : "Promote to agent"}
      </button>
      {ibs.length === 0 ? (
        <p className="field-hint">Promote an IB first — every agent must belong to one IB.</p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? <p className="lead">{success}</p> : null}
    </form>
  );
}

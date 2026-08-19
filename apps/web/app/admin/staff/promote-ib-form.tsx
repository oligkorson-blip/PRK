"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { promoteToIb } from "@/lib/staff/promote-actions";

export function PromoteIbForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
        const result = await promoteToIb({ email: nextEmail });
        if (result.ok) {
          setEmail("");
          setSuccess(`Promoted ${nextEmail} to IB.`);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The IB could not be promoted. Please try again.");
      }
    });
  }

  return (
    <form className="onboarding-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>IB email</span>
        <input
          type="email"
          name="email"
          required
          value={email}
          disabled={isPending}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ib@example.com"
          autoComplete="off"
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Promoting…" : "Promote to IB"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? <p className="lead">{success}</p> : null}
    </form>
  );
}

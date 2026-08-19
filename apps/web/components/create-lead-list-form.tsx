"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createLeadList } from "@/lib/leads/admin-actions";

export function CreateLeadListForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [defaultSource, setDefaultSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    }
  }, [error, isPending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await createLeadList({ name, defaultSource });
        if (result.ok) {
          setName("");
          setDefaultSource("");
          router.push(`/admin/leads/${result.listId}`);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The lead list could not be created. Please try again.");
      }
    });
  }

  return (
    <form className="onboarding-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>List name</span>
        <input
          type="text"
          name="name"
          required
          value={name}
          disabled={isPending}
          onChange={(event) => setName(event.target.value)}
          placeholder="Q3 cold outreach"
          autoComplete="off"
        />
      </label>
      <label className="form-field">
        <span>Default source</span>
        <input
          type="text"
          name="defaultSource"
          value={defaultSource}
          disabled={isPending}
          onChange={(event) => setDefaultSource(event.target.value)}
          placeholder="Used when CSV source cell is empty"
          autoComplete="off"
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? "Creating…" : "Create list"}
      </button>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
    </form>
  );
}

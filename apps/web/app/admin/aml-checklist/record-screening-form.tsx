"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { recordScreening } from "@/lib/aml/actions";

export function RecordScreeningForm({ investorId }: { investorId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        const result = await recordScreening({
          investorId,
          result: String(data.get("result") ?? ""),
          screeningNote: String(data.get("screeningNote") ?? ""),
          sourceOfFundsNote: String(data.get("sourceOfFundsNote") ?? "")
        });
        if (result.ok) {
          form.reset();
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("The screening could not be recorded. Please try again.");
      }
    });
  }

  return (
    <form className="record-screening-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Screening result</span>
        <select name="result" required defaultValue="" disabled={isPending}>
          <option value="" disabled>
            Select a result
          </option>
          <option value="clear">Clear</option>
          <option value="review">Needs review</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <label className="form-field">
        <span>Sanctions / PEP screening note</span>
        <textarea
          name="screeningNote"
          required
          minLength={8}
          maxLength={500}
          rows={2}
          disabled={isPending}
          placeholder="Manual check or vendor reference"
        />
      </label>
      <label className="form-field">
        <span>Source-of-funds note (optional)</span>
        <textarea
          name="sourceOfFundsNote"
          maxLength={500}
          rows={2}
          disabled={isPending}
        />
      </label>
      <button className="btn btn-primary btn-sm" type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Record screening"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

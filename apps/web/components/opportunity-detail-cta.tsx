"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInterest } from "@/lib/interests/actions";
import { INTEREST_CONNECTION_ERROR } from "@/lib/copy/cta";
import type { DetailCtaDecision } from "@/lib/copy/cta";
import type { InvestmentOption } from "@/lib/assets/investment-options";

export function AllocationCta({
  cta,
  assetSlug,
  selected,
  termsSeen = true
}: {
  cta: DetailCtaDecision;
  assetSlug: string;
  selected: InvestmentOption | undefined;
  termsSeen?: boolean;
}) {
  if (!selected) return null;

  if (cta.message && !cta.primaryLabel && !cta.allowsInterestForm) {
    return (
      <p className="field-hint">
        {cta.message}{" "}
        <Link href="/opportunities">View opportunities</Link>
      </p>
    );
  }

  if (cta.allowsInterestForm) {
    if (!termsSeen) {
      return (
        <p className="field-hint" role="status">
          Review{" "}
          <a href="#terms">terms</a> and <a href="#risks">risks</a> on this page before expressing
          interest.
        </p>
      );
    }
    return <InterestFormWithOption assetSlug={assetSlug} option={selected} />;
  }

  if (cta.primaryLabel && cta.primaryHref) {
    return (
      <>
        <Link className="btn btn-primary btn-block" href={cta.primaryHref}>
          {cta.primaryLabel} <span className="arrow">→</span>
        </Link>
        {cta.kind === "apply" ? (
          <Link className="btn btn-ghost btn-block" href="/sign-in">
            Sign in
          </Link>
        ) : null}
      </>
    );
  }

  return null;
}

function InterestFormWithOption({
  assetSlug,
  option
}: {
  assetSlug: string;
  option: InvestmentOption;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [acked, setAcked] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const amountId = `${uid}-amount`;
  const noteId = `${uid}-note`;
  const errorId = `${uid}-error`;
  const ackId = `${uid}-ack`;

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (success) {
      successRef.current?.focus();
    }
  }, [error, isPending, success]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAmountError(false);
    if (!acked) {
      setError("Please tick the box to confirm you've read the Risk Disclosure.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const amountEur = Number(formData.get("amountEur"));
    const note = String(formData.get("note") ?? "");

    startTransition(async () => {
      try {
        const result = await createInterest({
          assetSlug,
          amountEur,
          note,
          optionId: option.id,
          riskAcknowledged: true
        });
        if (result.ok) {
          setSuccess(true);
          router.refresh();
        } else {
          const lowerError = result.error.toLowerCase();
          setAmountError(
            lowerError.includes("amount") ||
              lowerError.includes("minimum") ||
              lowerError.includes("ticket")
          );
          setError(result.error);
        }
      } catch {
        setAmountError(false);
        setError(INTEREST_CONNECTION_ERROR);
      }
    });
  }

  if (success) {
    return (
      <div
        ref={successRef}
        className="interest-form-success"
        role="status"
        tabIndex={-1}
      >
        <p>
          Interest received. We&apos;ll review it and be in touch — this isn&apos;t a confirmed
          investment yet.
        </p>
        <p>
          <Link className="link-arrow" href="/portal">
            View dashboard
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form className="interest-form" onSubmit={handleSubmit} aria-busy={isPending}>
      <fieldset className="form-fieldset" disabled={isPending}>
        <legend className="sr-only">Interest details</legend>
        <label className="form-field" htmlFor={amountId}>
          <span>Investment amount (EUR)</span>
          <input
            key={option.id}
            id={amountId}
            name="amountEur"
            type="number"
            min={option.minTicketEur}
            step={1}
            required
            defaultValue={option.minTicketEur}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? errorId : undefined}
          />
        </label>
        <label className="form-field" htmlFor={noteId}>
          <span>Note (optional)</span>
          <textarea id={noteId} name="note" maxLength={500} rows={2} />
        </label>
        <label className="form-field checkbox-field" htmlFor={ackId}>
          <input
            id={ackId}
            type="checkbox"
            checked={acked}
            onChange={(e) => setAcked(e.target.checked)}
            aria-invalid={error && !acked ? true : undefined}
            aria-describedby={error && !acked ? errorId : undefined}
          />
          <span>
            I understand this is non-binding and I have read the{" "}
            <Link href="/legal/risk">Risk Disclosure</Link>.
          </span>
        </label>
      </fieldset>
      {error ? (
        <p ref={errorRef} className="form-error" role="alert" id={errorId} tabIndex={-1}>
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={isPending || !acked}>
        {isPending ? "Submitting…" : "Express interest"}
      </button>
    </form>
  );
}
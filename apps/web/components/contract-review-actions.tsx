"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContractState } from "@/lib/contracts/lifecycle";
import { recordInvestorContractReview } from "@/lib/contracts/actions";

const REVIEW_ORDER: ContractState[] = [
  "ready_to_review",
  "summary_viewed",
  "agreement_viewed",
  "investor_signed",
  "counter_signature_pending",
  "effective",
  "signed_documents_available"
];

export function ContractReviewActions({
  contractId,
  contractVersion,
  state,
  summaryAvailable,
  agreementAvailable
}: {
  contractId: string;
  contractVersion: string;
  state: ContractState;
  summaryAvailable: boolean;
  agreementAvailable: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const stateIndex = REVIEW_ORDER.indexOf(state);
  const summaryReviewed = stateIndex >= REVIEW_ORDER.indexOf("summary_viewed");
  const agreementReviewed = stateIndex >= REVIEW_ORDER.indexOf("agreement_viewed");

  function markReviewed(documentType: "summary" | "agreement") {
    setError(null);
    startTransition(async () => {
      const result = await recordInvestorContractReview({
        contractId,
        contractVersion,
        documentType
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (
    !summaryAvailable &&
    !agreementAvailable
  ) {
    return null;
  }
  if (state === "superseded" || state === "withdrawn") return null;
  const agreementLocked = summaryAvailable && !summaryReviewed;

  return (
    <div className="stack-4">
      {summaryAvailable ? (
        <div className="document-row-actions">
          <span className="field-hint">
            Summary: {summaryReviewed ? "reviewed" : "review not yet confirmed"}
          </span>
          {!summaryReviewed ? (
            <button
              className="btn btn-primary"
              type="button"
              disabled={isPending}
              onClick={() => markReviewed("summary")}
            >
              {isPending ? "Saving…" : "I have reviewed the summary"}
            </button>
          ) : null}
        </div>
      ) : null}

      {agreementAvailable ? (
        <div className="document-row-actions">
          <span className="field-hint">
            Full agreement: {agreementReviewed ? "reviewed" : "review not yet confirmed"}
          </span>
          {!agreementReviewed ? (
            <>
              <button
                className="btn btn-primary"
                type="button"
                disabled={isPending || agreementLocked}
                onClick={() => markReviewed("agreement")}
              >
                {isPending ? "Saving…" : "I have reviewed the agreement"}
              </button>
              {agreementLocked ? (
                <span className="field-hint">Review the summary first.</span>
              ) : null}
            </>
          ) : null}
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

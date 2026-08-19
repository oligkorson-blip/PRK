"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAgreementFromInterest } from "@/lib/contracts/admin-create";
import { formatEur } from "@/lib/format";

export function CreateAgreementFromInterestButton({
  interestId,
  investorEmail,
  assetName,
  amountEur
}: {
  interestId: string;
  investorEmail: string;
  assetName: string;
  amountEur: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createAgreementFromInterest({ interestId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/contracts/${result.contractId}`);
      router.refresh();
    });
  }

  return (
    <div className="admin-create-agreement">
      <p className="field-hint">
        {investorEmail} · {assetName} · {formatEur(amountEur)}
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Creating…" : "Create agreement"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

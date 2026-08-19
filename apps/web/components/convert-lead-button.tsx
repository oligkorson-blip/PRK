"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertLeadToInvestorInvite } from "@/lib/leads/convert-actions";

export function ConvertLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (
      !window.confirm(
        "Create an investor record from this lead and send a portal invite?"
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await convertLeadToInvestorInvite({ leadId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        result.emailSent
          ? "Investor created and invite emailed."
          : "Investor created. Invite email was skipped — deliver the link securely."
      );
      router.push(`/admin/investors/${result.investorId}`);
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Converting…" : "Convert & invite"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="field-hint" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

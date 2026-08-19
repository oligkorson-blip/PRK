/** AML screening (kyc_checks) input validation — mirrors lib/ops/reject-note.ts style. */
export const KYC_CHECK_RESULTS = ["clear", "review", "rejected"] as const;
export type KycCheckResult = (typeof KYC_CHECK_RESULTS)[number];

export function validateScreeningInput(input: {
  result: string;
  screeningNote: string | undefined | null;
  sourceOfFundsNote?: string | undefined | null;
}):
  | {
      ok: true;
      data: {
        result: KycCheckResult;
        screeningNote: string;
        sourceOfFundsNote: string | null;
      };
    }
  | { ok: false; error: string } {
  if (!(KYC_CHECK_RESULTS as readonly string[]).includes(input.result)) {
    return { ok: false, error: "Select a valid screening result." };
  }
  const screeningNote = input.screeningNote?.trim() ?? "";
  if (screeningNote.length < 8) {
    return { ok: false, error: "Screening note required (at least 8 characters)." };
  }
  if (screeningNote.length > 500) {
    return { ok: false, error: "Screening note must be 500 characters or fewer." };
  }
  const sourceOfFundsNote = input.sourceOfFundsNote?.trim() ?? "";
  if (sourceOfFundsNote.length > 500) {
    return { ok: false, error: "Source-of-funds note must be 500 characters or fewer." };
  }
  return {
    ok: true,
    data: {
      result: input.result as KycCheckResult,
      screeningNote,
      sourceOfFundsNote: sourceOfFundsNote.length ? sourceOfFundsNote : null
    }
  };
}

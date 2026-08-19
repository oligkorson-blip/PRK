/** Shared ops note / reject-reason validation (application + KYC). */
export function validateOpsRejectNote(
  note: string | undefined | null
): { ok: true; note: string } | { ok: false; error: string } {
  const trimmed = note?.trim() ?? "";
  if (trimmed.length < 8) {
    return { ok: false, error: "Rejection note required (at least 8 characters)." };
  }
  if (trimmed.length > 500) {
    return { ok: false, error: "Rejection note must be 500 characters or fewer." };
  }
  return { ok: true, note: trimmed };
}

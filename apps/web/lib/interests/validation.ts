// Hard ceiling, same as recordDistribution: larger figures overflow the
// integer column on insert and are almost certainly keying errors.
const MAX_INTEREST_AMOUNT_EUR = 10_000_000;

export function validateInterestAmount(amountEur: number, minTicketEur: number) {
  if (!Number.isInteger(amountEur) || amountEur < minTicketEur) {
    return { ok: false as const, error: `Amount must be a whole number of at least €${minTicketEur}.` };
  }
  if (amountEur > MAX_INTEREST_AMOUNT_EUR) {
    return { ok: false as const, error: "Amount looks too large. Check the figure." };
  }
  return { ok: true as const };
}

export function validateInterestNote(note: string | null | undefined) {
  const trimmed = (note ?? "").trim();
  if (trimmed.length > 500) {
    return { ok: false as const, error: "Note must be 500 characters or fewer." };
  }
  return { ok: true as const, note: trimmed.length ? trimmed : null };
}

/** Advisory raise target used for catalogue funding UI. Not a committed AUM claim. */
export function seedAdvisoryCapacityEur(input: {
  minTicketEur: number;
  spaces: number;
}): number {
  const fromTicket = Math.max(0, Math.round(input.minTicketEur)) * 50;
  const fromSpaces = Math.round(Math.max(0, input.spaces) * 2_500);
  return Math.max(fromTicket, fromSpaces);
}

export function parseAdvisoryCapacityInput(
  raw: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed.replace(/[,_\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return { ok: false, error: "Advisory capacity must be a whole euro amount, or blank to clear." };
  }
  if (n > 500_000_000) {
    return { ok: false, error: "Advisory capacity is unrealistically high." };
  }
  return { ok: true, value: n === 0 ? null : n };
}

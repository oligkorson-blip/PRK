export const MAX_INTERESTS_PER_DAY = 10;

// UTC day boundary so the daily cap resets at 00:00 UTC regardless of the
// investor's local timezone.
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

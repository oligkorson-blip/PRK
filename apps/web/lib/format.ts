export function formatEur(n: number): string {
  return n.toLocaleString("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  });
}

export function formatYieldPct(n: string | number): string {
  const value = typeof n === "string" ? Number(n) : n;
  return `${value.toFixed(1)}%`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * User-facing calendar day: DD-MM-YYYY.
 * Accepts a Date or an ISO date/datetime string. Uses the UTC calendar day so
 * server and client render the same stamp (avoids hydration drift).
 * HTML date inputs and APIs still use YYYY-MM-DD — only display goes through here.
 */
export function formatDateDdMmYyyy(value: Date | string): string {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${pad2(date.getUTCDate())}-${pad2(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
}

/** User-facing UTC stamp: DD-MM-YYYY HH:mm:ss UTC */
export function formatDateTimeUtc(value: Date): string {
  return (
    `${formatDateDdMmYyyy(value)} ` +
    `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}:${pad2(value.getUTCSeconds())} UTC`
  );
}

/**
 * Route-param guard: ids are Postgres UUIDs. Checking the format before
 * querying turns malformed ids into clean 404s instead of database
 * errors (22P02) bubbling up as 500s.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

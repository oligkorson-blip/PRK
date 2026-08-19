/**
 * Best-effort per-IP throttle for the public apply form.
 *
 * Process-local fixed-window counters: the map resets on restart/deploy and is
 * scoped to a single server instance, so this only blunts bursts. The per-email
 * cap in lib/apply/actions.ts (backed by the submissions table) stays the
 * authoritative limit — do not rely on this module for hard guarantees.
 */
const WINDOW_MS = 60 * 60 * 1000;
export const IP_THROTTLE_MAX_PER_WINDOW = 5;
/** Hard cap on tracked IPs — new keys are refused beyond this (see ipThrottleAllows). */
export const IP_THROTTLE_MAX_BUCKETS = 10_000;

type Bucket = { count: number; resetAt: number };
// Keyed by `${action}:${ip}` — each public action gets its own per-IP window,
// so sign-in hint failures on a shared NAT IP can't exhaust the application
// bucket (and vice versa).
const buckets = new Map<string, Bucket>();

/**
 * Client IP from an X-Forwarded-For header, for throttling.
 *
 * Takes the RIGHT-most entry: the hop closest to the server, appended by our
 * own trusted proxy (the app resolves forwarded IPs right-to-left past trusted
 * hops — see lib/auth/auth.ts). Every earlier entry is client-supplied, so
 * trusting the first one would let a caller rotate forged values and defeat
 * the throttle. Returns null when no usable value is present; callers treat
 * null as "allow" (see ipThrottleAllows).
 */
export function clientIpFromForwardedFor(header: string | null | undefined): string | null {
  if (!header) return null;
  const entries = header.split(",");
  const last = entries[entries.length - 1]?.trim();
  return last || null;
}

/**
 * Returns false once `ip` has exhausted the window allowance for `action`.
 * Unknown IPs always pass. `action` namespaces the bucket (e.g. "apply.submit"
 * vs "apply.sign-in-hint") — callers must pass a distinct, stable key per
 * public action so one action's failures never throttle another.
 */
export function ipThrottleAllows(
  action: string,
  ip: string | null,
  nowMs = Date.now()
): boolean {
  if (!ip) return true;

  // Opportunistic sweep so expired buckets free capacity before the hard cap below.
  if (buckets.size >= IP_THROTTLE_MAX_BUCKETS) {
    for (const [key, value] of buckets) {
      if (value.resetAt <= nowMs) buckets.delete(key);
    }
  }

  const key = `${action}:${ip}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= nowMs) {
    // Hard cap: refuse keys not already tracked when the map stays full after
    // the sweep. Without it, attacker-chosen IPs (spoofed XFF) could grow the
    // map unboundedly within a window. Already-tracked IPs are unaffected.
    if (!bucket && buckets.size >= IP_THROTTLE_MAX_BUCKETS) return false;
    buckets.set(key, { count: 1, resetAt: nowMs + WINDOW_MS });
    return true;
  }
  if (bucket.count >= IP_THROTTLE_MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

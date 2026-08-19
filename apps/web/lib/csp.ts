/**
 * Per-request Content-Security-Policy. The nonce is generated in middleware
 * and forwarded on the request headers: server components read it via
 * headers(), and Next.js parses the CSP request header to nonce its own
 * framework scripts. 'strict-dynamic' extends that trust to the chunks those
 * scripts load, so no host allowlist beyond 'self' is needed (and 'self' is
 * only a fallback for browsers without 'strict-dynamic' support).
 */
export function buildContentSecurityPolicy(
  nonce: string,
  isProd = process.env.NODE_ENV === "production"
): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // Inline scripts run only with the per-request nonce; eval is required by
    // the dev toolchain (react-refresh) but never allowed in production.
    isProd
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    // Cover/gallery asset URLs are https-only, so plaintext http: images are
    // never needed — https: alone covers remote assets.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
}

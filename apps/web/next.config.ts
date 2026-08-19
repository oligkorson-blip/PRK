import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy is intentionally not set here: script-src uses a
// per-request nonce, so the policy is assembled in middleware.ts (lib/csp.ts).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()"
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload"
        }
      ]
    : [])
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // KYC uploads allow 10 MB and admin document uploads allow 15 MB. Leave
    // enough room for multipart metadata before application validation runs.
    middlewareClientMaxBodySize: "16mb",
    serverActions: {
      bodySizeLimit: "16mb"
    }
  },
  async headers() {
    const privateRouteHeaders = [{ key: "Cache-Control", value: "private, no-store" }];

    return [
      { source: "/admin", headers: privateRouteHeaders },
      { source: "/admin/:path*", headers: privateRouteHeaders },
      { source: "/portal", headers: privateRouteHeaders },
      { source: "/portal/:path*", headers: privateRouteHeaders },
      { source: "/api", headers: privateRouteHeaders },
      { source: "/api/:path*", headers: privateRouteHeaders },
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;

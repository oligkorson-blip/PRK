import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/csp";

function directives(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    map.set(tokens[0], tokens.slice(1));
  }
  return map;
}

describe("buildContentSecurityPolicy", () => {
  it("production: nonce + strict-dynamic, no unsafe-inline or unsafe-eval in script-src", () => {
    const scriptSrc = directives(buildContentSecurityPolicy("testnonce", true)).get("script-src");
    expect(scriptSrc).toEqual(["'self'", "'nonce-testnonce'", "'strict-dynamic'"]);
  });

  it("development: keeps unsafe-eval for the dev toolchain, still no unsafe-inline", () => {
    const scriptSrc = directives(buildContentSecurityPolicy("testnonce", false)).get("script-src");
    expect(scriptSrc).toEqual([
      "'self'",
      "'nonce-testnonce'",
      "'strict-dynamic'",
      "'unsafe-eval'"
    ]);
  });

  it("keeps the remaining directives intact in both modes", () => {
    const expected: Record<string, string[]> = {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "upgrade-insecure-requests": []
    };
    for (const isProd of [true, false]) {
      const parsed = directives(buildContentSecurityPolicy("n", isProd));
      for (const [name, sources] of Object.entries(expected)) {
        expect(parsed.get(name), `${name} (isProd=${isProd})`).toEqual(sources);
      }
    }
  });

  it("embeds the given per-request nonce", () => {
    const a = buildContentSecurityPolicy("nonce-a", true);
    const b = buildContentSecurityPolicy("nonce-b", true);
    expect(a).toContain("'nonce-nonce-a'");
    expect(b).toContain("'nonce-nonce-b'");
    expect(a).not.toBe(b);
  });
});

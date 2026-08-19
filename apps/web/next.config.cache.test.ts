import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("private route cache policy", () => {
  it("marks admin, portal, and API routes private and non-cacheable", () => {
    const src = readFileSync(path.join(root, "next.config.ts"), "utf8");

    expect(src).toContain('value: "private, no-store"');
    expect(src).toContain('{ source: "/admin/:path*", headers: privateRouteHeaders }');
    expect(src).toContain('{ source: "/portal/:path*", headers: privateRouteHeaders }');
    expect(src).toContain('{ source: "/api/:path*", headers: privateRouteHeaders }');
  });

  it("keeps the public security header rule", () => {
    const src = readFileSync(path.join(root, "next.config.ts"), "utf8");

    expect(src).toContain('source: "/:path*"');
    expect(src).toContain("headers: securityHeaders");
  });
});

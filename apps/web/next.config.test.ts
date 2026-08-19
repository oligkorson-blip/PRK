import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("security response headers", () => {
  it("disables browser DNS prefetching and cross-domain policy discovery", () => {
    const src = readFileSync(path.join(root, "next.config.ts"), "utf8");

    expect(src).toContain('{ key: "X-DNS-Prefetch-Control", value: "off" }');
    expect(src).toContain('{ key: "X-Permitted-Cross-Domain-Policies", value: "none" }');
  });

  it("keeps the existing clickjacking and transport protections", () => {
    const src = readFileSync(path.join(root, "next.config.ts"), "utf8");

    expect(src).toContain('{ key: "X-Frame-Options", value: "DENY" }');
    expect(src).toContain('key: "Strict-Transport-Security"');
  });
});

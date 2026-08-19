import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("global error recovery", () => {
  it("renders a standalone accessible recovery document", () => {
    const src = readFileSync(path.join(root, "app/global-error.tsx"), "utf8");

    expect(src).toContain('"use client"');
    expect(src).toContain('<html lang="en">');
    expect(src).toContain('role="alert"');
    expect(src).toContain('aria-labelledby="global-error-title"');
    expect(src).toContain('aria-describedby="global-error-description"');
    expect(src).toContain("reset()");
  });
});

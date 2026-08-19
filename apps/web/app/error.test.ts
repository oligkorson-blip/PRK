import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("application error recovery semantics", () => {
  it("labels the error region and its recovery guidance", () => {
    const src = readFileSync(path.join(root, "app/error.tsx"), "utf8");

    expect(src).toContain('aria-labelledby="app-error-title"');
    expect(src).toContain('aria-describedby="app-error-description"');
    expect(src).toContain('id="app-error-title"');
    expect(src).toContain('id="app-error-description"');
  });
});

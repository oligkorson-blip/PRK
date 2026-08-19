import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("not-found recovery semantics", () => {
  it("labels the not-found region and its guidance", () => {
    const src = readFileSync(path.join(root, "app/not-found.tsx"), "utf8");

    expect(src).toContain('aria-labelledby="not-found-title"');
    expect(src).toContain('aria-describedby="not-found-description"');
    expect(src).toContain('id="not-found-title"');
    expect(src).toContain('id="not-found-description"');
  });
});

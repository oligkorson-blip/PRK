import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("robots private route policy", () => {
  it("blocks private route roots as well as their descendants", () => {
    const src = readFileSync(path.join(root, "app/robots.ts"), "utf8");

    expect(src).toContain('"/admin"');
    expect(src).toContain('"/portal"');
    expect(src).toContain('"/api"');
    expect(src).toContain('"/onboarding"');
    expect(src).toContain('"/set-password"');
    expect(src).toContain('"/sign-up"');
  });
});

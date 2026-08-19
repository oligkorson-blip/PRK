import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("holding detail closed opportunity state", () => {
  it("uses a non-interactive status badge instead of a disabled button", () => {
    const src = readFileSync(
      path.join(root, "app/portal/holdings/[id]/page.tsx"),
      "utf8"
    );

    expect(src).toContain('<span className="badge badge-status-closed">Opportunity closed</span>');
    expect(src).not.toContain('aria-disabled="true"');
    expect(src).not.toContain('<span className="btn btn-primary"');
  });
});

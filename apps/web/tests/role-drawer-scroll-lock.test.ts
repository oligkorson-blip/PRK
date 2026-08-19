import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("role portal drawer behavior", () => {
  it("locks background scroll while the investor drawer is open", () => {
    const src = read("components/portal-shell.tsx");

    expect(src).toContain('const previousOverflow = document.body.style.overflow;');
    expect(src).toContain('document.body.style.overflow = "hidden";');
    expect(src).toContain("document.body.style.overflow = previousOverflow;");
  });

  it("locks background scroll while the admin drawer is open", () => {
    const src = read("components/admin/admin-shell.tsx");

    expect(src).toContain('const previousOverflow = document.body.style.overflow;');
    expect(src).toContain('document.body.style.overflow = "hidden";');
    expect(src).toContain("document.body.style.overflow = previousOverflow;");
  });
});

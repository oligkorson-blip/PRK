import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("bulk lead feedback", () => {
  it("focuses and announces bulk status outcomes", () => {
    const src = read("components/leads-bulk-table.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const feedbackRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("feedbackRef.current?.focus();");
    expect(src).toContain('<p ref={feedbackRef} className="form-error" role="alert" tabIndex={-1}>');
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain("those leads remain selected so you can retry.");
  });
});

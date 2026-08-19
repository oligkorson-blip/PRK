import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("operations decision feedback", () => {
  it("focuses interest decision success and recovery", () => {
    const src = read("components/admin-interest-actions.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const noticeRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("noticeRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={noticeRef}");
    expect(src).toContain('aria-live="polite"');
  });

  it("confirms distribution cancellation and focuses its outcome", () => {
    const src = read("components/admin-distribution-cancel-button.tsx");

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const noticeRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("Distribution cancelled.");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("noticeRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={noticeRef}");
  });
});

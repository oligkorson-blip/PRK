import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("lead assignment feedback", () => {
  it("confirms single-lead assignment updates and focuses recovery messages", () => {
    const src = read("components/assign-lead-form.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain('setMessage("Lead assignment updated.");');
    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={messageRef}");
    expect(src).toContain('aria-live="polite"');
  });

  it("focuses bulk assignment outcomes", () => {
    const src = read("components/assign-lead-form.tsx");

    expect(src).toContain("const successRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={successRef}");
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
  });
});

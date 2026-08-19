import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("lead edit feedback", () => {
  it("confirms stage updates and focuses recovery messages", () => {
    const src = read("components/lead-stage-select.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLSpanElement>(null);");
    expect(src).toContain("const messageRef = useRef<HTMLSpanElement>(null);");
    expect(src).toContain('setMessage("Stage updated.");');
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<span ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={messageRef}");
    expect(src).toContain('aria-live="polite"');
  });

  it("confirms lead detail saves and focuses recovery messages", () => {
    const src = read("components/lead-details-form.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain('setMessage("Lead details saved.");');
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={messageRef}");
    expect(src).toContain('aria-live="polite"');
  });
});

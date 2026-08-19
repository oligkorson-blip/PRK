import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("activity feedback", () => {
  it("confirms call logging and focuses recovery messages", () => {
    const src = read("components/log-call-form.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain('setMessage("Call logged.");');
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={messageRef}");
    expect(src).toContain('aria-live="polite"');
  });

  it("confirms investor notes and focuses recovery messages", () => {
    const src = read("components/admin-investor-note-form.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain('setMessage("Note saved.");');
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={messageRef}");
    expect(src).toContain('aria-live="polite"');
  });
});

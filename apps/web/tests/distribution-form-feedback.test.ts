import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("distribution form feedback", () => {
  it("focuses distribution outcomes and locks the form while saving", () => {
    const src = read("components/admin-distribution-form.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const successRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("successRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={successRef}");
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain('disabled={isPending || status !== "paid"}');
    expect(src).toContain('disabled={isPending}>');
  });

  it("exposes the distribution form pending state accessibly", () => {
    const src = read("components/admin-distribution-form.tsx");

    expect(src).toContain(
      '<form className="form-card admin-distribution-form" onSubmit={handleSubmit} aria-busy={isPending}>'
    );
    expect(src).toContain(
      '<fieldset className="form-fieldset" disabled={isPending}>'
    );
    expect(src).toContain('<legend className="sr-only">Distribution details</legend>');
  });
});

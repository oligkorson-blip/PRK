import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const formPath = path.join(process.cwd(), "components/kyc-upload-form.tsx");

describe("KYC upload feedback", () => {
  it("focuses upload and review outcomes for recovery", () => {
    const src = readFileSync(formPath, "utf8");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const okRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("okRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={okRef}");
    expect(src).toContain('role="status"');
    expect(src).toContain("tabIndex={-1}");
  });

  it("locks document upload controls while the request is pending", () => {
    const src = readFileSync(formPath, "utf8");

    expect(src).toContain(
      '<form className="interest-form" onSubmit={handleUpload} aria-busy={isPending}>'
    );
    expect(src).toContain(
      '<fieldset className="form-fieldset" disabled={isPending}>'
    );
    expect(src).toContain('<legend className="sr-only">Document upload</legend>');
  });
});

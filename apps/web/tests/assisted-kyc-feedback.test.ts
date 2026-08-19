import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("assisted KYC feedback", () => {
  it("focuses assisted KYC outcomes and announces them", () => {
    const src = read("components/admin-assisted-kyc.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={messageRef}");
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
  });

  it("locks assisted KYC forms while actions are pending", () => {
    const src = read("components/admin-assisted-kyc.tsx");

    expect(src).toContain(
      '<form className="interest-form stack-4" onSubmit={handleUpload} aria-busy={isPending}>'
    );
    expect(src).toContain('<legend className="sr-only">Document upload</legend>');
    expect(src).toContain(
      '<form className="interest-form stack-4" onSubmit={handleProfile} aria-busy={isPending}>'
    );
    expect(src).toContain('<legend className="sr-only">Onboarding profile</legend>');
    expect(src.match(/<fieldset className="form-fieldset" disabled={isPending}>/g)).toHaveLength(2);
  });
});

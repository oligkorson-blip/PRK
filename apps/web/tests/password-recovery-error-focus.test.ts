import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const authDir = path.join(process.cwd(), "app/(auth)");

describe("password recovery error recovery", () => {
  it("focuses forgot-password errors and the sent confirmation", () => {
    const src = readFileSync(path.join(authDir, "forgot-password/page.tsx"), "utf8");

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const submittedRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("if (pending) return;");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("submittedRef.current?.focus();");
    expect(src).toContain('<p ref={submittedRef} role="status" tabIndex={-1}>');
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });

  it("focuses invalid-link and reset-form errors", () => {
    const src = readFileSync(path.join(authDir, "reset-password/page.tsx"), "utf8");

    expect(src).toContain("const invalidErrorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("invalidErrorRef.current?.focus();");
    expect(src).toContain('<p ref={invalidErrorRef} role="alert" tabIndex={-1}>');
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });

  it("focuses missing-token and invite setup errors", () => {
    const src = readFileSync(path.join(authDir, "set-password/page.tsx"), "utf8");

    expect(src).toContain("const missingTokenRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("missingTokenRef.current?.focus();");
    expect(src).toContain(
      '<p ref={missingTokenRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });
});

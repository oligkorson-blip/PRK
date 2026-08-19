import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const enrollment = path.join(process.cwd(), "components/two-factor-enrollment.tsx");

describe("two-factor recovery feedback", () => {
  it("keeps the interactive management panel out of a broad status live region", () => {
    const src = readFileSync(enrollment, "utf8");

    expect(src).toContain('<div className="portal-banner portal-banner-flow">');
    expect(src).not.toContain(
      '<div className="portal-banner portal-banner-flow" role="status">'
    );
  });

  it("focuses management errors and newly generated backup-code guidance", () => {
    const src = readFileSync(enrollment, "utf8");

    expect(src).toContain("const freshCodesRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("freshCodesRef.current?.focus();");
    expect(src).toContain(
      '<p ref={freshCodesRef} role="status" tabIndex={-1}>'
    );
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });

  it("focuses setup and verification errors", () => {
    const src = readFileSync(enrollment, "utf8");

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("if (pending || !error) return;");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("TWO_FACTOR_SETUP_CONNECTION_ERROR");
    expect(src).toContain("TWO_FACTOR_VERIFY_CONNECTION_ERROR");
  });
});

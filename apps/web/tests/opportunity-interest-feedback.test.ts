import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ctaPath = path.join(process.cwd(), "components/opportunity-detail-cta.tsx");

describe("opportunity interest feedback", () => {
  it("moves focus to the outcome after an interest submission", () => {
    const src = readFileSync(ctaPath, "utf8");

    expect(src).toContain("useEffect, useId, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const successRef = useRef<HTMLDivElement>(null);");
    expect(src).toContain("if (isPending) return;");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("successRef.current?.focus();");
    expect(src).toContain(
      '<div\n        ref={successRef}\n        className="interest-form-success"\n        role="status"\n        tabIndex={-1}'
    );
  });

  it("associates validation errors with the focused field", () => {
    const src = readFileSync(ctaPath, "utf8");

    expect(src).toContain('aria-describedby={error && !acked ? errorId : undefined}');
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" id={errorId} tabIndex={-1}>'
    );
  });

  it("locks interest details while the request is pending", () => {
    const src = readFileSync(ctaPath, "utf8");

    expect(src).toContain(
      '<form className="interest-form" onSubmit={handleSubmit} aria-busy={isPending}>'
    );
    expect(src).toContain(
      '<fieldset className="form-fieldset" disabled={isPending}>'
    );
    expect(src).toContain('<legend className="sr-only">Interest details</legend>');
  });
});

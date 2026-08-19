import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const filePath = path.join(process.cwd(), "components/admin-investor-access-actions.tsx");

describe("investor access action feedback", () => {
  it("focuses lifecycle success, delivery, and error outcomes", () => {
    const src = readFileSync(filePath, "utf8");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const deliveryRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("deliveryRef.current?.focus();");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={messageRef}");
    expect(src).toContain("ref={deliveryRef}");
    expect(src).toContain('aria-live="polite"');
  });

  it("moves focus into the rejection note when the editor opens", () => {
    const src = readFileSync(filePath, "utf8");

    expect(src).toContain("const rejectNoteRef = useRef<HTMLTextAreaElement>(null);");
    expect(src).toContain("if (rejectOpen) {");
    expect(src).toContain("rejectNoteRef.current?.focus();");
    expect(src).toContain("ref={rejectNoteRef}");
  });
});

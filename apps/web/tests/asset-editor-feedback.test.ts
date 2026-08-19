import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("asset editor feedback", () => {
  it("confirms capacity saves and locks the field while saving", () => {
    const src = read("components/asset-capacity-form.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain('setMessage("Capacity saved.");');
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={messageRef}");
    expect(src).toContain('disabled={isPending}');
    expect(src).toContain('aria-busy={isPending}');
    expect(src).toContain(
      '<fieldset className="form-fieldset" disabled={isPending}>'
    );
    expect(src).toContain(
      '<legend className="sr-only">Asset capacity</legend>'
    );
  });

  it("confirms image saves and locks fields while saving", () => {
    const src = read("components/asset-image-form.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain('setMessage("Images saved.");');
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("ref={messageRef}");
    expect(src).toContain('disabled={isPending}');
    expect(src).toContain('aria-busy={isPending}');
    expect(src).toContain(
      '<fieldset className="form-fieldset" disabled={isPending}>'
    );
    expect(src).toContain(
      '<legend className="sr-only">Asset images</legend>'
    );
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const settingsDir = path.join(process.cwd(), "app/portal/settings");

describe("privacy action feedback", () => {
  it("confirms a completed data export and focuses export errors", () => {
    const src = readFileSync(path.join(settingsDir, "download-my-data.tsx"), "utf8");

    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("setMessage(\"Your data export is ready.\");");
    expect(src).toContain("messageRef.current?.focus();");
    expect(src).toContain(
      '<p ref={messageRef} className="field-hint" role="status" aria-live="polite" tabIndex={-1}>'
    );
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });

  it("focuses session-revocation success and error messages", () => {
    const src = readFileSync(path.join(settingsDir, "revoke-sessions-button.tsx"), "utf8");

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
    expect(src).toContain("const messageRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain(
      '<p ref={messageRef} className="field-hint" role="status" aria-live="polite" tabIndex={-1}>'
    );
  });
});

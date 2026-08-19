import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("lead assignment error feedback", () => {
  it("focuses assignment errors after the request settles", () => {
    const src = readFileSync(
      path.join(root, "components/lead-assignment-panel.tsx"),
      "utf8"
    );

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });

  it("exposes a labelled busy assignment group", () => {
    const src = readFileSync(
      path.join(root, "components/lead-assignment-panel.tsx"),
      "utf8"
    );

    expect(src).toContain(
      '<div className="assignment-panel" aria-busy={isPending}>'
    );
    expect(src).toContain(
      '<fieldset className="form-fieldset" disabled={isPending}>'
    );
    expect(src).toContain('<legend className="sr-only">Lead assignment</legend>');
  });
});

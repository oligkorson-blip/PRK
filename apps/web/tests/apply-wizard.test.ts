import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("application submission error feedback", () => {
  it("focuses the server error after submission settles", () => {
    const src = readFileSync(
      path.join(root, "components/apply-wizard.tsx"),
      "utf8"
    );

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain('<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>');
  });
});

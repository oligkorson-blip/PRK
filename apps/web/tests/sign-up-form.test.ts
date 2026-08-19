import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("ops signup error feedback", () => {
  it("focuses the surfaced error after submission settles", () => {
    const src = readFileSync(
      path.join(root, "components/sign-up-form.tsx"),
      "utf8"
    );

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain('<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>');
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = path.join(process.cwd(), "components/withdraw-interest-button.tsx");

describe("withdrawal interaction feedback", () => {
  it("returns focus to the first safe confirmation action", () => {
    const src = readFileSync(componentPath, "utf8");

    expect(src).toContain("const keepRequestRef = useRef<HTMLButtonElement>(null);");
    expect(src).toContain("if (confirming) {");
    expect(src).toContain("keepRequestRef.current?.focus();");
    expect(src).toContain("ref={keepRequestRef}");
  });

  it("focuses withdrawal errors after the request settles", () => {
    const src = readFileSync(componentPath, "utf8");

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });
});

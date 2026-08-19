import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentsDir = path.join(process.cwd(), "components");

describe("navigation sign-out errors", () => {
  it("moves focus to public-header recovery guidance", () => {
    const src = readFileSync(path.join(componentsDir, "site-header.tsx"), "utf8");

    expect(src).toContain("const signOutErrorRef = useRef<HTMLSpanElement>(null);");
    expect(src).toContain("if (signOutPending || !signOutError) return;");
    expect(src).toContain("signOutErrorRef.current?.focus();");
    expect(src).toContain(
      '<span ref={signOutErrorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });

  it("moves focus to investor-portal recovery guidance", () => {
    const src = readFileSync(path.join(componentsDir, "portal-shell.tsx"), "utf8");

    expect(src).toContain("const signOutErrorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("if (signOutPending || !signOutError) return;");
    expect(src).toContain("signOutErrorRef.current?.focus();");
    expect(src).toContain(
      '<p ref={signOutErrorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });

  it("re-queries investor drawer focusables after dynamic feedback appears", () => {
    const src = readFileSync(path.join(componentsDir, "portal-shell.tsx"), "utf8");

    expect(src).toContain("const getFocusables = () =>");
    expect(src).toContain("getFocusables()[0]?.focus();");
    expect(src).toContain("const list = getFocusables();");
    expect(src).not.toContain("const list = Array.from(focusables);");
  });
});

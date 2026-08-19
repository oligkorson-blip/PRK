import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appDir = process.cwd();
const signInPage = path.join(appDir, "app/(auth)/sign-in/page.tsx");
const twoFactorChallenge = path.join(appDir, "components/two-factor-challenge.tsx");

describe("authentication error recovery", () => {
  it("moves focus to sign-in recovery guidance", () => {
    const src = readFileSync(signInPage, "utf8");

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("if (isPending || !error) return;");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });

  it("moves focus to two-factor recovery guidance", () => {
    const src = readFileSync(twoFactorChallenge, "utf8");

    expect(src).toContain("const errorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("if (pending || !error) return;");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain(
      '<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });
});

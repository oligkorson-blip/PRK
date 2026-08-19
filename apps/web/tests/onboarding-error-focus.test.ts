import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const onboardingForm = path.join(process.cwd(), "components/onboarding-form.tsx");

describe("onboarding server errors", () => {
  it("moves focus to the recovery message after a failed submission", () => {
    const src = readFileSync(onboardingForm, "utf8");

    expect(src).toContain("const serverErrorRef = useRef<HTMLParagraphElement>(null);");
    expect(src).toContain("if (isPending || state.ok || !state.error) return;");
    expect(src).toContain("serverErrorRef.current?.focus();");
    expect(src).toContain(
      '<p ref={serverErrorRef} className="form-error" role="alert" tabIndex={-1}>'
    );
  });
});

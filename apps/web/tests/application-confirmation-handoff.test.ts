import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const applyWizard = path.join(process.cwd(), "components/apply-wizard.tsx");

describe("application confirmation handoff", () => {
  it("announces success and keeps the team handoff on the public contact route", () => {
    const src = readFileSync(applyWizard, "utf8");

    expect(src).toContain(
      "// Announce the confirmation after the submit button is replaced by the success panel."
    );
    expect(src).toContain("if (!doneMessage) return;");
    expect(src).toContain("headingRef.current?.focus();");
    expect(src).toContain(
      '<Link className="btn btn-ghost" href="/contact">'
    );
    expect(src).not.toContain(
      'href="mailto:contact@parkwise.eu?subject=Next%20steps%20for%20my%20application"'
    );
  });
});

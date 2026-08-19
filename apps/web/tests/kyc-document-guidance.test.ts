import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("KYC document replacement guidance", () => {
  it("keeps replacement instructions accurate for each review state", () => {
    const src = read("app/portal/kyc/page.tsx");

    expect(src).toContain("{canManageFiles ? (");
    expect(src).toContain("Before submitting, download a file or replace it if needed.");
    expect(src).toContain("Need to update one?");
    expect(src).toContain('href="/contact"');
  });

  it("explains the review state and gives investors a next step", () => {
    const src = read("lib/copy/kyc.ts");

    expect(src).toContain(
      "Your documents are with our team for review. If you need to make a change, contact the team."
    );
    expect(src).not.toContain("Your documents are currently locked.");
  });

  it("focuses document replacement errors", () => {
    const src = read("components/remove-kyc-document-button.tsx");

    expect(src).toContain("useEffect, useRef, useState, useTransition");
    expect(src).toContain("const errorRef = useRef<HTMLSpanElement>(null);");
    expect(src).toContain("errorRef.current?.focus();");
    expect(src).toContain('role="alert" tabIndex={-1}');
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("KYC document action layout", () => {
  it("keeps filenames and controls in separate responsive groups", () => {
    const css = read("app/globals.css");
    const page = read("app/portal/kyc/page.tsx");
    const removeButton = read("components/remove-kyc-document-button.tsx");

    expect(page).toContain("document-row-actions");
    expect(removeButton).toContain("document-remove-action");
    expect(css).toContain(".document-row-actions");
    expect(css).toContain(".document-remove-action");
    expect(css).toMatch(
      /\.portal-file-row\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?\}/
    );
  });
});

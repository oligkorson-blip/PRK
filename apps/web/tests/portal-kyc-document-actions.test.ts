import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("KYC document actions", () => {
  it("names download and change actions for the specific document", () => {
    const page = readFileSync(
      path.join(root, "app/portal/kyc/page.tsx"),
      "utf8"
    );
    const changeButton = readFileSync(
      path.join(root, "components/remove-kyc-document-button.tsx"),
      "utf8"
    );

    expect(page).toContain("aria-label={`Download " + "$" + "{f.title}`}");
    expect(page).toContain(
      "<RemoveKycDocumentButton documentId={f.id} title={f.title} />"
    );
    expect(changeButton).toContain("aria-label={`Change " + "$" + "{title}`}");
  });
});

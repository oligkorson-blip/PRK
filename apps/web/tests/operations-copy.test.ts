import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  OPERATIONS_ACTION_ERROR,
  OPERATIONS_DOCUMENT_UPLOAD_ERROR,
  OPERATIONS_DOCUMENT_UPLOAD_UNAVAILABLE,
  OPERATIONS_OPPORTUNITY_UPDATE_ERROR
} from "@/lib/copy/operations";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("operations copy", () => {
  it("keeps staff fallbacks actionable and human", () => {
    for (const message of [
      OPERATIONS_ACTION_ERROR,
      OPERATIONS_OPPORTUNITY_UPDATE_ERROR,
      OPERATIONS_DOCUMENT_UPLOAD_ERROR,
      OPERATIONS_DOCUMENT_UPLOAD_UNAVAILABLE
    ]) {
      expect(message).toMatch(/try again|ask the team/i);
      expect(message).not.toMatch(/something went wrong|documents_dir|storage not configured|^failed$/i);
    }
  });

  it("wires shared copy into staff surfaces without implementation details", () => {
    const assetActions = read("components/asset-status-actions.tsx");
    expect(assetActions).toContain("OPERATIONS_OPPORTUNITY_UPDATE_ERROR");
    expect(assetActions).not.toContain("Something went wrong.");

    const documentUpload = read("components/document-upload-form.tsx");
    expect(documentUpload).toContain("OPERATIONS_DOCUMENT_UPLOAD_UNAVAILABLE");
    expect(documentUpload).toContain("OPERATIONS_DOCUMENT_UPLOAD_ERROR");
    expect(documentUpload).not.toContain("DOCUMENTS_DIR");

    const accessActions = read("components/admin-investor-access-actions.tsx");
    expect(accessActions).toContain("OPERATIONS_ACTION_ERROR");
    expect(accessActions).not.toContain('result.error ?? "Failed"');
  });
});

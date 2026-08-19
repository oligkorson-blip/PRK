import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildObjectKey, resolveObjectPath } from "@/lib/storage/local";

describe("local storage keys", () => {
  let savedDocumentsDir: string | undefined;

  beforeEach(() => {
    savedDocumentsDir = process.env.DOCUMENTS_DIR;
  });

  afterEach(() => {
    if (savedDocumentsDir === undefined) {
      delete process.env.DOCUMENTS_DIR;
    } else {
      process.env.DOCUMENTS_DIR = savedDocumentsDir;
    }
  });

  it("builds prefixed keys with a uuid segment, keeps the extension, and strips traversal", () => {
    const key = buildObjectKey({
      ownerType: "asset",
      ownerId: "11111111-1111-1111-1111-111111111111",
      filename: "../../evil.pdf"
    });
    expect(key.startsWith("docs/asset/11111111-1111-1111-1111-111111111111/")).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
    expect(key.includes("..")).toBe(false);
    const name = key.split("/").at(-1) ?? "";
    expect(name).toMatch(
      /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-zA-Z0-9._-]+$/
    );
  });

  it("never reuses a key for same-name uploads in the same millisecond", () => {
    const a = buildObjectKey({ ownerType: "investor", ownerId: null, filename: "doc.pdf" });
    const b = buildObjectKey({ ownerType: "investor", ownerId: null, filename: "doc.pdf" });
    expect(a.startsWith("docs/investor/platform/")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("rejects keys that escape the documents root", () => {
    process.env.DOCUMENTS_DIR = "/tmp/parkwise-docs-test";
    expect(() => resolveObjectPath("../outside.pdf")).toThrow();
  });
});

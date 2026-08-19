import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { encryptObject, isEncryptedObject, readObject } from "./local";

const originalDocumentsDir = process.env.DOCUMENTS_DIR;
let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;

  if (originalDocumentsDir === undefined) delete process.env.DOCUMENTS_DIR;
  else process.env.DOCUMENTS_DIR = originalDocumentsDir;
});

describe("document storage framing", () => {
  it("recognizes complete encrypted objects without misclassifying legacy files", () => {
    const encrypted = encryptObject(Buffer.from("%PDF-1.7"), Buffer.alloc(32, 7));

    expect(isEncryptedObject(encrypted)).toBe(true);
    expect(isEncryptedObject(Buffer.from("%PDF-1.7"))).toBe(false);
  });

  it("keeps truncated encryption magic on the decrypt path", () => {
    expect(isEncryptedObject(Buffer.from("PWENC1"))).toBe(true);
    expect(isEncryptedObject(Buffer.from("PWENC"))).toBe(false);
  });

  it("rejects a truncated encrypted file instead of returning raw bytes", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "park-storage-"));
    process.env.DOCUMENTS_DIR = tempDir;

    const key = "truncated";
    const fullPath = path.join(tempDir, key);
    await writeFile(fullPath, Buffer.from("PWENC1"));

    await expect(readObject(key)).rejects.toThrow("header is truncated");
    await expect(readFile(fullPath)).resolves.toEqual(Buffer.from("PWENC1"));
  });
});

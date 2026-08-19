import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isEncryptedObject,
  isStorageConfigured,
  putObject,
  readObject,
  requireDocumentsEncryptionKey
} from "@/lib/storage/local";
import { sniffMatchesType } from "@/lib/storage/sniff";

const KEY_A = "a".repeat(64); // 32-byte hex key
const KEY_B = "b".repeat(64); // different valid key
const KEY_BASE64 = Buffer.from("c".repeat(32), "utf8").toString("base64");
const HEADER_LENGTH = 6 + 12 + 16; // PWENC1 + IV + auth tag

// Minimal magic-byte-valid PDF (sniffMatchesType checks the %PDF header).
const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25]);

const ENV_NAMES = ["DOCUMENTS_DIR", "DOCUMENTS_ENCRYPTION_KEY", "DEMO_MODE"] as const;

describe("document vault encryption at rest", () => {
  let dir: string;
  let saved: Record<(typeof ENV_NAMES)[number], string | undefined>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "parkwise-docs-enc-"));
    saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]])) as typeof saved;
    process.env.DOCUMENTS_DIR = dir;
    delete process.env.DOCUMENTS_ENCRYPTION_KEY;
    delete process.env.DEMO_MODE;
  });

  afterEach(async () => {
    for (const name of ENV_NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function rawStored(key: string): Promise<Buffer> {
    return fs.readFile(path.join(dir, key));
  }

  it("round-trips: putObject encrypts on disk, readObject returns the plaintext", async () => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = KEY_A;
    await putObject("docs/investor/platform/a.pdf", PDF_BYTES, "application/pdf");

    const stored = await rawStored("docs/investor/platform/a.pdf");
    expect(isEncryptedObject(stored)).toBe(true);
    expect(stored.subarray(0, 6).toString("utf8")).toBe("PWENC1");
    expect(stored.length).toBe(HEADER_LENGTH + PDF_BYTES.length);
    expect(stored.includes(PDF_BYTES)).toBe(false); // no plaintext leakage

    const read = await readObject("docs/investor/platform/a.pdf");
    expect(read.equals(PDF_BYTES)).toBe(true);
  });

  it("accepts a base64-encoded 32-byte key", async () => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = KEY_BASE64;
    await putObject("docs/b.pdf", PDF_BYTES, "application/pdf");
    expect(isEncryptedObject(await rawStored("docs/b.pdf"))).toBe(true);
    expect((await readObject("docs/b.pdf")).equals(PDF_BYTES)).toBe(true);
  });

  it("passes legacy plaintext files through untouched on read", async () => {
    const full = path.join(dir, "docs/legacy.pdf");
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, PDF_BYTES);
    const read = await readObject("docs/legacy.pdf");
    expect(read.equals(PDF_BYTES)).toBe(true);
  });

  it("writes plaintext with a warn-log when demo mode is explicit and the key is unset", async () => {
    process.env.DEMO_MODE = "true";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await putObject("docs/plain.pdf", PDF_BYTES, "application/pdf");
    const stored = await rawStored("docs/plain.pdf");
    expect(isEncryptedObject(stored)).toBe(false);
    expect(stored.equals(PDF_BYTES)).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[storage:plaintext]"));
    warn.mockRestore();
  });

  it("fails closed on putObject when the key is unset and DEMO_MODE=false", async () => {
    process.env.DEMO_MODE = "false";
    await expect(putObject("docs/nope.pdf", PDF_BYTES, "application/pdf")).rejects.toThrow(
      /DOCUMENTS_ENCRYPTION_KEY is not set/
    );
    await expect(fs.stat(path.join(dir, "docs/nope.pdf"))).rejects.toThrow();
  });

  it("fails closed when both the key and DEMO_MODE are unset — forgetting DEMO_MODE in production cannot disable encryption", async () => {
    // beforeEach leaves both unset: isDemoMode's unset-is-demo default (banner,
    // seed guard) must not leak into the encryption-at-rest check.
    await expect(putObject("docs/nope.pdf", PDF_BYTES, "application/pdf")).rejects.toThrow(
      /DOCUMENTS_ENCRYPTION_KEY is not set/
    );
    await expect(fs.stat(path.join(dir, "docs/nope.pdf"))).rejects.toThrow();
  });

  it("rejects a malformed key at first use — never a plaintext fallback", async () => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = "not-a-valid-key";
    await expect(putObject("docs/x.pdf", PDF_BYTES, "application/pdf")).rejects.toThrow(
      /malformed/
    );
    expect(() => requireDocumentsEncryptionKey()).toThrow(/malformed/);
  });

  it("fails to decrypt with the wrong key", async () => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = KEY_A;
    await putObject("docs/a.pdf", PDF_BYTES, "application/pdf");
    process.env.DOCUMENTS_ENCRYPTION_KEY = KEY_B;
    await expect(readObject("docs/a.pdf")).rejects.toThrow(/Failed to decrypt document/);
  });

  it("detects tampering when a ciphertext byte is flipped", async () => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = KEY_A;
    await putObject("docs/t.pdf", PDF_BYTES, "application/pdf");
    const full = path.join(dir, "docs/t.pdf");
    const stored = await fs.readFile(full);
    stored[stored.length - 1] = stored[stored.length - 1] ^ 0xff; // flip last ciphertext byte
    await fs.writeFile(full, stored);
    await expect(readObject("docs/t.pdf")).rejects.toThrow(/Failed to decrypt document/);
  });

  it("detects tampering when an auth-tag byte is flipped", async () => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = KEY_A;
    await putObject("docs/tag.pdf", PDF_BYTES, "application/pdf");
    const full = path.join(dir, "docs/tag.pdf");
    const stored = await fs.readFile(full);
    stored[6] = stored[6] ^ 0x01; // inside the 12-byte IV/tag header region
    await fs.writeFile(full, stored);
    await expect(readObject("docs/tag.pdf")).rejects.toThrow(/Failed to decrypt document/);
  });

  it("fails with a clear error when reading an encrypted file without the key", async () => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = KEY_A;
    await putObject("docs/enc.pdf", PDF_BYTES, "application/pdf");
    delete process.env.DOCUMENTS_ENCRYPTION_KEY;
    await expect(readObject("docs/enc.pdf")).rejects.toThrow(/DOCUMENTS_ENCRYPTION_KEY is not set/);
  });

  it("keeps the path-traversal guards intact on the encrypted read/write path", async () => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = KEY_A;
    await expect(putObject("../escape.pdf", PDF_BYTES, "application/pdf")).rejects.toThrow(
      /Invalid storage key/
    );
    await expect(readObject("../escape.pdf")).rejects.toThrow(/Invalid storage key/);
    await expect(readObject("/etc/passwd")).rejects.toThrow(/Invalid storage key/);
  });

  it("encrypts after sniffing: stored bytes hide the type, decrypted bytes still sniff-match", async () => {
    process.env.DOCUMENTS_ENCRYPTION_KEY = KEY_A;
    // Callers sniff the plaintext File before putObject; the vault only sees ciphertext.
    const upload = new File([Uint8Array.from(PDF_BYTES)], "id.pdf", { type: "application/pdf" });
    await expect(sniffMatchesType(upload, "application/pdf")).resolves.toBe(true);

    await putObject("docs/kyc/id.pdf", PDF_BYTES, "application/pdf");
    const stored = await rawStored("docs/kyc/id.pdf");
    // The %PDF- signature is not recoverable from the encrypted blob on disk.
    expect(stored.subarray(0, 5).equals(PDF_BYTES.subarray(0, 5))).toBe(false);

    const decrypted = await readObject("docs/kyc/id.pdf");
    const roundTripped = new File([Uint8Array.from(decrypted)], "id.pdf", { type: "application/pdf" });
    await expect(sniffMatchesType(roundTripped, "application/pdf")).resolves.toBe(true);
  });

  it("keeps isStorageConfigured keyed to DOCUMENTS_DIR only", () => {
    expect(isStorageConfigured()).toBe(true);
    delete process.env.DOCUMENTS_DIR;
    expect(isStorageConfigured()).toBe(false);
  });
});

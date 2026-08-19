import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isExplicitDemoMode } from "@/lib/demo-mode";

/**
 * Encryption at rest for the document vault (KYC). When DOCUMENTS_ENCRYPTION_KEY
 * is set (32-byte key, hex or base64 — generate with `openssl rand -hex 32`),
 * putObject stores AES-256-GCM blobs laid out as:
 *
 *   ["PWENC1" magic (6 bytes)][12-byte IV][16-byte auth tag][ciphertext]
 *
 * readObject detects the magic and decrypts; files without it (the legacy
 * plaintext vault) pass through untouched, so existing documents stay readable.
 * A malformed key always throws at first use — there is never a silent fallback
 * to plaintext writes once the key is configured. With the key unset, plaintext
 * writes are allowed only when demo mode is explicitly enabled (DEMO_MODE=true
 * or 1, warn-logged). Unset or false fails closed, so a production deploy that
 * forgets both DEMO_MODE and the key cannot silently store KYC documents in
 * plaintext — isDemoMode's unset-is-demo default governs the banner and seed
 * guard only, never encryption at rest.
 */
const ENCRYPTION_MAGIC = Buffer.from("PWENC1", "utf8");
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM standard nonce
const TAG_LENGTH = 16;
const HEADER_LENGTH = ENCRYPTION_MAGIC.length + IV_LENGTH + TAG_LENGTH;

function decodeKeyMaterial(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      "DOCUMENTS_ENCRYPTION_KEY is malformed — expected a 32-byte key as 64 hex chars or base64 (generate with `openssl rand -hex 32`)."
    );
  }
  return key;
}

/** The configured key, or null when unset/malformed. */
function resolveEncryptionKey(): Buffer | null {
  const raw = process.env.DOCUMENTS_ENCRYPTION_KEY;
  if (!raw || !raw.trim()) return null;
  return decodeKeyMaterial(raw);
}

/**
 * The 32-byte DOCUMENTS_ENCRYPTION_KEY, or a clear error when unset/malformed.
 * Used by scripts/encrypt-documents.ts to fail fast before touching any file.
 */
export function requireDocumentsEncryptionKey(): Buffer {
  const key = resolveEncryptionKey();
  if (!key) {
    throw new Error(
      "DOCUMENTS_ENCRYPTION_KEY is not set — refusing to handle encrypted documents without it. Generate one with `openssl rand -hex 32`."
    );
  }
  return key;
}

/** True when the stored bytes carry the PWENC1 AES-256-GCM header. */
export function isEncryptedObject(stored: Buffer): boolean {
  return (
    stored.length >= ENCRYPTION_MAGIC.length &&
    stored.subarray(0, ENCRYPTION_MAGIC.length).equals(ENCRYPTION_MAGIC)
  );
}

/** Encrypts plaintext into a PWENC1 blob (magic + IV + auth tag + ciphertext). */
export function encryptObject(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([ENCRYPTION_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptObject(stored: Buffer): Buffer {
  if (stored.length < HEADER_LENGTH) {
    throw new Error(
      "Failed to decrypt document — the encrypted file header is truncated or corrupted."
    );
  }

  const key = requireDocumentsEncryptionKey();
  const iv = stored.subarray(ENCRYPTION_MAGIC.length, ENCRYPTION_MAGIC.length + IV_LENGTH);
  const tag = stored.subarray(ENCRYPTION_MAGIC.length + IV_LENGTH, HEADER_LENGTH);
  const ciphertext = stored.subarray(HEADER_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error(
      "Failed to decrypt document — DOCUMENTS_ENCRYPTION_KEY does not match or the file is corrupted."
    );
  }
}

export function buildObjectKey(parts: {
  ownerType: string;
  ownerId: string | null;
  filename: string;
}): string {
  const safeName =
    path
      .basename(parts.filename)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "") || "file.pdf";
  const ownerSegment = parts.ownerId ?? "platform";
  return `docs/${parts.ownerType}/${ownerSegment}/${Date.now()}-${randomUUID()}-${safeName}`;
}

export function documentsRoot(): string {
  const root = process.env.DOCUMENTS_DIR;
  if (!root) throw new Error("DOCUMENTS_DIR is not set");
  return path.resolve(root);
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.DOCUMENTS_DIR);
}

export function resolveObjectPath(key: string): string {
  if (!key || key.includes("..") || path.isAbsolute(key)) {
    throw new Error("Invalid storage key");
  }
  const root = documentsRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error("Invalid storage key");
  }
  return full;
}

export async function putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
  const full = resolveObjectPath(key);
  const encryptionKey = resolveEncryptionKey();
  if (!encryptionKey && !isExplicitDemoMode()) {
    throw new Error(
      "DOCUMENTS_ENCRYPTION_KEY is not set — refusing to store documents unencrypted unless demo mode is explicit (DEMO_MODE=true). Generate one with `openssl rand -hex 32`."
    );
  }
  await fs.mkdir(path.dirname(full), { recursive: true });
  if (encryptionKey) {
    // Callers sniff the plaintext before upload; only the stored bytes are encrypted.
    await fs.writeFile(full, encryptObject(body, encryptionKey));
    return;
  }
  console.warn(
    "[storage:plaintext] DOCUMENTS_ENCRYPTION_KEY is not set — storing document unencrypted (demo mode only). Set the key to enable AES-256-GCM encryption at rest."
  );
  await fs.writeFile(full, body);
}

export async function readObject(key: string): Promise<Buffer> {
  const stored = await fs.readFile(resolveObjectPath(key));
  // Legacy plaintext vault files (no PWENC1 header) pass through untouched.
  if (!isEncryptedObject(stored)) return stored;
  return decryptObject(stored);
}

export async function deleteObject(key: string): Promise<void> {
  await fs.rm(resolveObjectPath(key), { force: true });
}

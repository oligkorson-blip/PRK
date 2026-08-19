import { config } from "dotenv";
import path from "node:path";

config({ path: path.join(__dirname, "../.env.local") });
config({ path: path.join(__dirname, "../.env") });

import fs from "node:fs/promises";
import {
  documentsRoot,
  encryptObject,
  isEncryptedObject,
  requireDocumentsEncryptionKey
} from "../lib/storage/local";

/**
 * One-time migration: encrypts every plaintext file in DOCUMENTS_DIR in place
 * with AES-256-GCM (see lib/storage/local.ts for the PWENC1 blob layout).
 * Files already carrying the PWENC1 header are skipped, so the script is
 * idempotent and safe to re-run. Reads stay backward-compatible throughout —
 * readObject decrypts PWENC1 blobs and passes plaintext through untouched.
 *
 * Requires DOCUMENTS_ENCRYPTION_KEY (32 bytes, hex or base64 — generate with
 * `openssl rand -hex 32`); the script fails fast before touching any file when
 * the key is unset or malformed. Back up the vault first (scripts/backup.sh).
 *
 * Run with --dry-run to list what would be encrypted without writing, e.g.:
 *   cd /srv/parkwise/apps/web && npx tsx scripts/encrypt-documents.ts --dry-run
 *   cd /srv/parkwise/apps/web && npx tsx scripts/encrypt-documents.ts
 */

const dryRun = process.argv.includes("--dry-run");

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function main() {
  const root = documentsRoot();
  // Fail fast on an unset/malformed key before any file is read or written.
  const key = requireDocumentsEncryptionKey();

  let encrypted = 0;
  let skipped = 0;
  for await (const file of walk(root)) {
    const stored = await fs.readFile(file);
    if (isEncryptedObject(stored)) {
      skipped += 1;
      continue;
    }
    const rel = path.relative(root, file);
    if (!dryRun) {
      await fs.writeFile(file, encryptObject(stored, key));
    }
    encrypted += 1;
    console.log(
      `encrypt-documents${dryRun ? " (dry-run)" : ""}: ${dryRun ? "would encrypt" : "encrypted"} ${rel}`
    );
  }
  console.log(
    `encrypt-documents${dryRun ? " (dry-run)" : ""}: ${dryRun ? "would encrypt" : "encrypted"} ${encrypted} file(s); skipped ${skipped} already-encrypted.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

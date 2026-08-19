const MAGIC_BYTES: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
};

/**
 * Verifies a file's leading bytes match the declared content type.
 * Unknown/unsupported declared types never pass.
 */
export async function sniffMatchesType(file: Blob, declaredType: string): Promise<boolean> {
  const magic = MAGIC_BYTES[declaredType];
  if (!magic) return false;
  const head = new Uint8Array(await file.slice(0, magic.length).arrayBuffer());
  if (head.length < magic.length) return false;
  return magic.every((byte, index) => head[index] === byte);
}

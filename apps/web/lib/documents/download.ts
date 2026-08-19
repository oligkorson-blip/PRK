const EXTENSION_BY_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png"
};

const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const DEFAULT_EXTENSION = ".bin";
const MAX_DOWNLOAD_BASENAME_LENGTH = 120;

function normalizeContentType(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  return EXTENSION_BY_TYPE[normalized] ? normalized : DEFAULT_CONTENT_TYPE;
}

function sanitizeDownloadBasename(title: string): string {
  const withoutKnownExtension = title.trim().replace(/\.(pdf|jpe?g|png)$/i, "");
  const safe = withoutKnownExtension
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, MAX_DOWNLOAD_BASENAME_LENGTH);

  return safe || "document";
}

/**
 * Converts stored document metadata into safe response metadata.
 *
 * Content types are allowlisted because the database column is intentionally
 * generic while uploads are currently PDF-only. Unknown or malformed values
 * must never become response headers.
 */
export function getDownloadMetadata(input: { title: string; contentType: string }): {
  contentType: string;
  filename: string;
} {
  const contentType = normalizeContentType(input.contentType);
  const extension = EXTENSION_BY_TYPE[contentType] ?? DEFAULT_EXTENSION;
  return {
    contentType,
    filename: `${sanitizeDownloadBasename(input.title)}${extension}`
  };
}

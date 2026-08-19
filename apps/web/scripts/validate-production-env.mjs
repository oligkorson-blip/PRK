import path from "node:path";
import { pathToFileURL } from "node:url";

function parseOrigin(name, value, errors) {
  try {
    const parsed = new URL(value);
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
      errors.push(`${name} must use https (http is accepted only for localhost)`);
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
      errors.push(`${name} must be an origin only, without a path, credentials, query, or fragment`);
    }
    return parsed.origin;
  } catch {
    errors.push(`${name} must be a valid absolute URL`);
    return undefined;
  }
}

// Mirrors lib/demo-mode.ts isDemoMode: live only when DEMO_MODE is "false"
// or "0" (case-insensitive, after trimming); unset or anything else is demo.
function isDemoMode(value) {
  const v = (value ?? "").trim().toLowerCase();
  return v !== "false" && v !== "0";
}

export function validateEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];
  const required = [
    "DATABASE_URL",
    "DOCUMENTS_DIR",
    "DEMO_MODE",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "SUPER_ADMIN_EMAILS"
  ];

  for (const name of required) {
    if (!env[name]?.trim()) errors.push(`${name} is required`);
  }

  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (secret && secret.length < 32) {
    errors.push("BETTER_AUTH_SECRET must be at least 32 characters");
  }
  if (/change-me|placeholder|replace-at-runtime|never-use/i.test(secret)) {
    errors.push("BETTER_AUTH_SECRET is still a known placeholder");
  }

  if (env.DATABASE_URL) {
    try {
      const database = new URL(env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(database.protocol)) {
        errors.push("DATABASE_URL must use the postgres or postgresql scheme");
      }
      if (!database.hostname || !database.pathname.slice(1)) {
        errors.push("DATABASE_URL must include a host and database name");
      }
    } catch {
      errors.push("DATABASE_URL must be a valid PostgreSQL URL; use a URL-safe password");
    }
  }

  const authOrigin = env.BETTER_AUTH_URL
    ? parseOrigin("BETTER_AUTH_URL", env.BETTER_AUTH_URL, errors)
    : undefined;
  const publicOrigin = env.NEXT_PUBLIC_APP_URL
    ? parseOrigin("NEXT_PUBLIC_APP_URL", env.NEXT_PUBLIC_APP_URL, errors)
    : undefined;
  if (authOrigin && publicOrigin && authOrigin !== publicOrigin) {
    errors.push("BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must be the same origin");
  }

  if (env.DOCUMENTS_DIR && !path.isAbsolute(env.DOCUMENTS_DIR)) {
    errors.push("DOCUMENTS_DIR must be an absolute path in production");
  }
  if (env.DEMO_MODE && !["true", "false", "0", "1"].includes(env.DEMO_MODE.trim().toLowerCase())) {
    errors.push("DEMO_MODE must be true/false (or 1/0) — anything else is treated as demo");
  }
  const live = !isDemoMode(env.DEMO_MODE);
  const encryptionKey = env.DOCUMENTS_ENCRYPTION_KEY?.trim() ?? "";
  if (live && !encryptionKey) {
    errors.push("DOCUMENTS_ENCRYPTION_KEY is required when DEMO_MODE=false");
  }
  if (encryptionKey) {
    const decodedKey = /^[0-9a-fA-F]{64}$/.test(encryptionKey)
      ? Buffer.from(encryptionKey, "hex")
      : Buffer.from(encryptionKey, "base64");
    if (decodedKey.length !== 32) {
      errors.push(
        "DOCUMENTS_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64"
      );
    }
  }

  const adminEmails = (env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  if (adminEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    errors.push("SUPER_ADMIN_EMAILS contains an invalid email address");
  }

  if (isDemoMode(env.DEMO_MODE)) {
    warnings.push("DEMO_MODE is enabled; keep it enabled until legal and data sign-off is complete");
  }
  const smtpHost = env.SMTP_HOST?.trim();
  const smtpFrom = env.SMTP_FROM?.trim();
  const smtpUser = env.SMTP_USER?.trim();
  const smtpPass = env.SMTP_PASS?.trim();
  if (live && !smtpHost) {
    errors.push("SMTP_HOST is required when DEMO_MODE=false so account recovery can work");
  }
  // In live mode the SMTP quartet is all-or-nothing: a partial config would
  // silently send with an empty password or a localhost fallback From address.
  if (live && (smtpHost || smtpFrom || smtpUser || smtpPass)) {
    if (!smtpFrom) errors.push("SMTP_FROM is required when SMTP is enabled");
    if (!smtpUser) errors.push("SMTP_USER is required when SMTP is enabled in live mode");
    if (!smtpPass) errors.push("SMTP_PASS is required when SMTP is enabled in live mode");
  }
  if (!live && smtpHost && !smtpFrom) {
    errors.push("SMTP_FROM is required when SMTP is enabled");
  }
  if (!live && Boolean(smtpUser) !== Boolean(smtpPass)) {
    errors.push("SMTP_USER and SMTP_PASS must either both be set or both be omitted");
  }

  return { errors, warnings };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const { errors, warnings } = validateEnvironment();
  for (const warning of warnings) console.warn(`[env:warning] ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`[env:error] ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Production environment validation passed.");
  }
}

/**
 * Postgres error-code extraction that survives driver wrapping.
 *
 * drizzle-orm wraps driver errors in `DrizzleQueryError`, moving the original
 * `PostgresError` (which carries `code`) onto `.cause`. Code that checks
 * `error.code === "23505"` against the outer error silently stops matching.
 * Walk the cause chain (depth-limited) and return the first SQLSTATE found.
 */
export function postgresErrorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 4 || typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code.length > 0) return code;
  return postgresErrorCode((error as { cause?: unknown }).cause, depth + 1);
}

/** SQLSTATE 23505 — unique_violation. */
export function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === "23505";
}

/**
 * Single source of truth for DEMO_MODE semantics: the deployment is a demo
 * unless DEMO_MODE is "false" or "0" (case-insensitive, after trimming).
 * Unset — or any other value — is demo, so the compliance banner and
 * destructive-seed guard fail safe.
 */
export function isDemoMode(value: string | undefined = process.env.DEMO_MODE): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v !== "false" && v !== "0";
}

/**
 * True only when demo mode is explicitly requested ("true" or "1",
 * case-insensitive, after trimming). Unlike isDemoMode, unset is NOT demo
 * here: checks whose default must fail closed (e.g. plaintext document
 * writes in lib/storage/local.ts) use this so a production deploy that
 * forgets DEMO_MODE cannot silently disable encryption at rest.
 */
export function isExplicitDemoMode(value: string | undefined = process.env.DEMO_MODE): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "true" || v === "1";
}

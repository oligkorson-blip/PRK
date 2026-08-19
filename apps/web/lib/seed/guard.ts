import { isDemoMode } from "../demo-mode";

/**
 * Seed deletes interests/holdings for removed asset slugs — refuse when not in demo mode
 * (DEMO_MODE=false or 0) unless the operator explicitly confirms with CONFIRM_SEED=1 (or true).
 */
export function assertSeedAllowed(
  env: Record<string, string | undefined> = process.env
): { ok: true } | { ok: false; error: string } {
  const confirm = (env.CONFIRM_SEED ?? "").trim().toLowerCase();
  const confirmed = confirm === "1" || confirm === "true";

  if (!isDemoMode(env.DEMO_MODE) && !confirmed) {
    return {
      ok: false,
      error:
        "Refusing db:seed: DEMO_MODE is not demo (destructive wipe of interests/holdings for removed slugs). Set CONFIRM_SEED=1 to proceed, or run only on demo/staging with DEMO_MODE=true."
    };
  }

  return { ok: true };
}

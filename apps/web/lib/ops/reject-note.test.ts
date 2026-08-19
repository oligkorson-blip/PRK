import { describe, expect, it } from "vitest";
import { validateOpsRejectNote } from "@/lib/ops/reject-note";

describe("validateOpsRejectNote", () => {
  it("rejects empty or short notes", () => {
    expect(validateOpsRejectNote("").ok).toBe(false);
    expect(validateOpsRejectNote("short").ok).toBe(false);
  });

  it("accepts a usable note", () => {
    const result = validateOpsRejectNote("  Incomplete ID pack  ");
    expect(result).toEqual({ ok: true, note: "Incomplete ID pack" });
  });

  it("rejects notes over 500 characters", () => {
    expect(validateOpsRejectNote("x".repeat(501)).ok).toBe(false);
  });
});

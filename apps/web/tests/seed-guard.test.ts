import { describe, expect, it } from "vitest";
import { assertSeedAllowed } from "@/lib/seed/guard";

describe("assertSeedAllowed", () => {
  it("allows seed when DEMO_MODE is true or unset", () => {
    expect(assertSeedAllowed({}).ok).toBe(true);
    expect(assertSeedAllowed({ DEMO_MODE: "true" }).ok).toBe(true);
  });

  it("treats DEMO_MODE=1 as demo", () => {
    expect(assertSeedAllowed({ DEMO_MODE: "1" }).ok).toBe(true);
  });

  it("blocks seed when DEMO_MODE=false without confirm", () => {
    const r = assertSeedAllowed({ DEMO_MODE: "false" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/CONFIRM_SEED/);
  });

  it("blocks seed when DEMO_MODE=0 without confirm", () => {
    const r = assertSeedAllowed({ DEMO_MODE: "0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/CONFIRM_SEED/);
  });

  it("allows seed when not demo and CONFIRM_SEED=1", () => {
    expect(assertSeedAllowed({ DEMO_MODE: "false", CONFIRM_SEED: "1" }).ok).toBe(true);
    expect(assertSeedAllowed({ DEMO_MODE: "0", CONFIRM_SEED: "true" }).ok).toBe(true);
  });
});

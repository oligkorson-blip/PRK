import { describe, expect, it } from "vitest";
import {
  parseAdvisoryCapacityInput,
  seedAdvisoryCapacityEur
} from "@/lib/assets/advisory-capacity";

describe("seedAdvisoryCapacityEur", () => {
  it("uses the larger of ticket×50 and spaces×2500", () => {
    expect(seedAdvisoryCapacityEur({ minTicketEur: 10_000, spaces: 400 })).toBe(1_000_000);
    expect(seedAdvisoryCapacityEur({ minTicketEur: 5_000, spaces: 800 })).toBe(2_000_000);
  });
});

describe("parseAdvisoryCapacityInput", () => {
  it("accepts blank as clear", () => {
    expect(parseAdvisoryCapacityInput("")).toEqual({ ok: true, value: null });
    expect(parseAdvisoryCapacityInput("  ")).toEqual({ ok: true, value: null });
  });

  it("parses whole euros", () => {
    expect(parseAdvisoryCapacityInput("1,250,000")).toEqual({ ok: true, value: 1_250_000 });
    expect(parseAdvisoryCapacityInput("0")).toEqual({ ok: true, value: null });
  });

  it("rejects decimals and negatives", () => {
    expect(parseAdvisoryCapacityInput("12.5").ok).toBe(false);
    expect(parseAdvisoryCapacityInput("-1").ok).toBe(false);
  });
});

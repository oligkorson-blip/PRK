import { describe, expect, it } from "vitest";
import { validateInterestAmount, validateInterestNote } from "@/lib/interests/validation";

describe("validateInterestAmount", () => {
  it("rejects below minimum", () => {
    expect(validateInterestAmount(1000, 9900).ok).toBe(false);
  });
  it("accepts exact minimum", () => {
    expect(validateInterestAmount(9900, 9900).ok).toBe(true);
  });
  it("rejects non-integers", () => {
    expect(validateInterestAmount(9900.5, 9900).ok).toBe(false);
  });
  it("rejects NaN", () => {
    expect(validateInterestAmount(NaN, 9900).ok).toBe(false);
  });
  it("rejects Infinity", () => {
    expect(validateInterestAmount(Infinity, 9900).ok).toBe(false);
    expect(validateInterestAmount(-Infinity, 9900).ok).toBe(false);
  });
  it("rejects negative amounts", () => {
    expect(validateInterestAmount(-9900, 9900).ok).toBe(false);
    expect(validateInterestAmount(-1, 0).ok).toBe(false);
  });
  it("accepts the €10M ceiling", () => {
    expect(validateInterestAmount(10_000_000, 9900).ok).toBe(true);
  });
  it("rejects above the €10M ceiling", () => {
    const result = validateInterestAmount(10_000_001, 9900);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Amount looks too large. Check the figure.");
    }
  });
});

describe("validateInterestNote", () => {
  it("allows empty", () => {
    expect(validateInterestNote("").ok).toBe(true);
  });
  it("rejects over 500 chars", () => {
    expect(validateInterestNote("x".repeat(501)).ok).toBe(false);
  });
});

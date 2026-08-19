import { describe, expect, it } from "vitest";
import { fundingFromAmounts } from "@/lib/assets/funding";

describe("fundingFromAmounts", () => {
  it("shows open without capacity", () => {
    const s = fundingFromAmounts(0, null);
    expect(s.pct).toBeNull();
    expect(s.open).toBe(true);
    expect(s.label).toMatch(/open/i);
  });

  it("computes percent against capacity", () => {
    const s = fundingFromAmounts(250_000, 1_000_000);
    expect(s.pct).toBe(25);
    expect(s.open).toBe(true);
    expect(s.label).toBe("25% funded");
  });

  it("marks full at capacity", () => {
    const s = fundingFromAmounts(1_000_000, 1_000_000);
    expect(s.pct).toBe(100);
    expect(s.open).toBe(false);
    expect(s.label).toBe("Full");
  });

  it("never rounds up to 100% while the raise is still open", () => {
    const s = fundingFromAmounts(999_500, 1_000_000);
    expect(s.pct).toBe(99);
    expect(s.open).toBe(true);
    expect(s.label).toBe("99% funded");
  });
});

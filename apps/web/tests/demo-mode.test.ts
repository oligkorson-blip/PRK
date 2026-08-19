import { describe, expect, it } from "vitest";
import { isDemoMode, isExplicitDemoMode } from "@/lib/demo-mode";

describe("isDemoMode", () => {
  it("treats unset and anything but false/0 as demo (banner/seed fail-safe)", () => {
    expect(isDemoMode(undefined)).toBe(true);
    expect(isDemoMode("")).toBe(true);
    expect(isDemoMode("true")).toBe(true);
    expect(isDemoMode("1")).toBe(true);
    expect(isDemoMode("yes")).toBe(true);
    expect(isDemoMode("false")).toBe(false);
    expect(isDemoMode(" 0 ")).toBe(false);
    expect(isDemoMode("FALSE")).toBe(false);
  });
});

describe("isExplicitDemoMode", () => {
  it("is true only for an explicit true/1", () => {
    expect(isExplicitDemoMode("true")).toBe(true);
    expect(isExplicitDemoMode(" TRUE ")).toBe(true);
    expect(isExplicitDemoMode("1")).toBe(true);
  });

  it("fails closed when unset, false, or any other value", () => {
    expect(isExplicitDemoMode(undefined)).toBe(false);
    expect(isExplicitDemoMode("")).toBe(false);
    expect(isExplicitDemoMode("false")).toBe(false);
    expect(isExplicitDemoMode("0")).toBe(false);
    expect(isExplicitDemoMode("yes")).toBe(false);
  });
});

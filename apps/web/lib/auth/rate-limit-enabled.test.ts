import { describe, expect, it } from "vitest";
import { isAuthRateLimitEnabled } from "@/lib/auth/rate-limit-enabled";

describe("isAuthRateLimitEnabled", () => {
  it("is on by default so production and unset deploys keep the sign-in cap", () => {
    expect(isAuthRateLimitEnabled(undefined)).toBe(true);
    expect(isAuthRateLimitEnabled("")).toBe(true);
    expect(isAuthRateLimitEnabled("true")).toBe(true);
    expect(isAuthRateLimitEnabled("1")).toBe(true);
    expect(isAuthRateLimitEnabled("yes")).toBe(true);
  });

  it("turns off only for an explicit false/0 (Playwright CI against one production server)", () => {
    expect(isAuthRateLimitEnabled("false")).toBe(false);
    expect(isAuthRateLimitEnabled("0")).toBe(false);
    expect(isAuthRateLimitEnabled(" FALSE ")).toBe(false);
  });
});

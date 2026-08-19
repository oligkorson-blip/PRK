import { describe, expect, it } from "vitest";
import { isAuthPath } from "@/lib/auth/auth-paths";

describe("isAuthPath", () => {
  it("matches credential auth pages", () => {
    for (const path of [
      "/sign-in",
      "/sign-up",
      "/set-password",
      "/forgot-password",
      "/reset-password"
    ]) {
      expect(isAuthPath(path)).toBe(true);
    }
  });

  it("matches post-auth journey pages (focused chrome)", () => {
    for (const path of ["/onboarding", "/two-factor", "/account/security"]) {
      expect(isAuthPath(path)).toBe(true);
    }
  });

  it("matches nested paths under an auth prefix", () => {
    expect(isAuthPath("/sign-in/anything")).toBe(true);
    expect(isAuthPath("/account/security/anything")).toBe(true);
  });

  it("does not match marketing, portal, or apply paths", () => {
    expect(isAuthPath("/")).toBe(false);
    expect(isAuthPath("/apply")).toBe(false);
    expect(isAuthPath("/portal")).toBe(false);
    expect(isAuthPath("/portal/settings")).toBe(false);
    expect(isAuthPath("/guides")).toBe(false);
    expect(isAuthPath("/account")).toBe(false);
  });
});

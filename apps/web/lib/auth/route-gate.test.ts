import { describe, expect, it } from "vitest";
import { hasSessionCookie, requiresAuth, resolveAuthRedirect } from "./route-gate";

describe("route authentication gate", () => {
  it("protects exact roots and descendants", () => {
    expect(requiresAuth("/admin")).toBe(true);
    expect(requiresAuth("/admin/contracts")).toBe(true);
    expect(requiresAuth("/portal")).toBe(true);
    expect(requiresAuth("/portal/contracts")).toBe(true);
    expect(requiresAuth("/onboarding")).toBe(true);
    expect(requiresAuth("/onboarding/profile")).toBe(true);
  });

  it("does not protect near-match public paths", () => {
    expect(requiresAuth("/administer")).toBe(false);
    expect(requiresAuth("/portalist")).toBe(false);
    expect(requiresAuth("/onboarding-help")).toBe(false);
    expect(requiresAuth("/opportunities")).toBe(true);
    expect(requiresAuth("/opportunities-extra")).toBe(false);
  });

  it("redirects only unauthenticated protected requests", () => {
    expect(resolveAuthRedirect({ pathname: "/portal", hasSessionCookie: false })).toBe("/sign-in");
    expect(resolveAuthRedirect({ pathname: "/portal", hasSessionCookie: true })).toBeNull();
    expect(resolveAuthRedirect({ pathname: "/opportunities", hasSessionCookie: false })).toBe("/sign-in");
  });

  it("recognizes supported secure and legacy session cookie names", () => {
    expect(
      hasSessionCookie({
        has: (name) => name === "__Secure-better-auth.session_token"
      })
    ).toBe(true);
    expect(
      hasSessionCookie({
        has: (name) => name === "better-auth-session_token"
      })
    ).toBe(true);
    expect(hasSessionCookie({ has: () => false })).toBe(false);
  });
});

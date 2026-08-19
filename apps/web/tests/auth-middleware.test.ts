import { describe, expect, it } from "vitest";
import { hasSessionCookie, requiresAuth, resolveAuthRedirect } from "@/lib/auth/route-gate";

describe("hasSessionCookie", () => {
  it.each([
    "__Secure-better-auth.session_token",
    "better-auth.session_token",
    "__Secure-better-auth-session_token",
    "better-auth-session_token"
  ])("recognizes Better Auth session cookie %s", (name) => {
    expect(hasSessionCookie(new Set([name]))).toBe(true);
  });

  it("ignores unrelated cookies", () => {
    expect(hasSessionCookie(new Set(["better-auth.session_data", "theme"]))).toBe(false);
  });
});

describe("requiresAuth", () => {
  it("protects portal, admin, onboarding, and the members-only catalogue (including nested paths)", () => {
    expect(requiresAuth("/portal")).toBe(true);
    expect(requiresAuth("/portal/holdings")).toBe(true);
    expect(requiresAuth("/admin")).toBe(true);
    expect(requiresAuth("/admin/assets")).toBe(true);
    expect(requiresAuth("/onboarding")).toBe(true);
    expect(requiresAuth("/opportunities")).toBe(true);
    expect(requiresAuth("/opportunities/some-slug")).toBe(true);
    expect(requiresAuth("/spaces")).toBe(true);
    expect(requiresAuth("/help-me-choose")).toBe(true);
  });

  it("does not protect public marketing and auth pages", () => {
    expect(requiresAuth("/")).toBe(false);
    expect(requiresAuth("/guides")).toBe(false);
    expect(requiresAuth("/sign-in")).toBe(false);
    expect(requiresAuth("/sign-up")).toBe(false);
    expect(requiresAuth("/apply")).toBe(false);
    expect(requiresAuth("/set-password")).toBe(false);
  });
});

describe("resolveAuthRedirect", () => {
  it("redirects unauthenticated users on protected routes to /sign-in", () => {
    expect(resolveAuthRedirect({ pathname: "/portal", hasSessionCookie: false })).toBe("/sign-in");
    expect(resolveAuthRedirect({ pathname: "/admin", hasSessionCookie: false })).toBe("/sign-in");
    expect(resolveAuthRedirect({ pathname: "/onboarding", hasSessionCookie: false })).toBe(
      "/sign-in"
    );
  });

  it("allows protected routes when a session cookie is present", () => {
    expect(resolveAuthRedirect({ pathname: "/portal", hasSessionCookie: true })).toBeNull();
  });

  it("redirects unauthenticated catalogue requests to /sign-in", () => {
    expect(resolveAuthRedirect({ pathname: "/opportunities", hasSessionCookie: false })).toBe(
      "/sign-in"
    );
    expect(resolveAuthRedirect({ pathname: "/spaces", hasSessionCookie: false })).toBe("/sign-in");
    expect(resolveAuthRedirect({ pathname: "/help-me-choose", hasSessionCookie: false })).toBe(
      "/sign-in"
    );
  });

  it("does not redirect public routes without a session", () => {
    expect(resolveAuthRedirect({ pathname: "/guides", hasSessionCookie: false })).toBeNull();
  });
});

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { isAdmin, isAdminEmail, warnIfSuperAdminFallback } from "@/lib/auth/roles";

describe("admin emails", () => {
  const prevSuper = process.env.SUPER_ADMIN_EMAILS;
  const prevAdmin = process.env.ADMIN_EMAILS;
  beforeEach(() => {
    process.env.SUPER_ADMIN_EMAILS = "ops@parkwise.eu, Admin@Example.com";
    delete process.env.ADMIN_EMAILS;
  });
  afterEach(() => {
    process.env.SUPER_ADMIN_EMAILS = prevSuper;
    process.env.ADMIN_EMAILS = prevAdmin;
  });

  it("matches SUPER_ADMIN_EMAILS case-insensitively", () => {
    expect(isAdminEmail("ops@parkwise.eu")).toBe(true);
    expect(isAdminEmail("admin@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com")).toBe(false);
  });

  it("isAdmin uses email list", () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin({ email: "ops@parkwise.eu" })).toBe(true);
    expect(isAdmin({ email: "nope@x.com" })).toBe(false);
  });
});

describe("warnIfSuperAdminFallback", () => {
  it("warns when SUPER_ADMIN_EMAILS is unset and ADMIN_EMAILS is granting super admin", () => {
    const warn = vi.fn();
    warnIfSuperAdminFallback({ ADMIN_EMAILS: "ops@parkwise.eu" }, warn);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("SUPER_ADMIN_EMAILS is unset"));
  });

  it("warns when SUPER_ADMIN_EMAILS is blank", () => {
    const warn = vi.fn();
    warnIfSuperAdminFallback(
      { SUPER_ADMIN_EMAILS: "  ", ADMIN_EMAILS: "ops@parkwise.eu" },
      warn
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  it("stays silent when SUPER_ADMIN_EMAILS is set explicitly", () => {
    const warn = vi.fn();
    warnIfSuperAdminFallback(
      { SUPER_ADMIN_EMAILS: "ops@parkwise.eu", ADMIN_EMAILS: "ops@parkwise.eu" },
      warn
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent when neither list grants anything (no fallback in effect)", () => {
    const warn = vi.fn();
    warnIfSuperAdminFallback({}, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});

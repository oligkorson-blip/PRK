import { afterEach, describe, expect, it, vi } from "vitest";
import {
  effectiveStaffRole,
  isActiveStaff,
  isAdmin,
  isSuperAdminEmail,
  parseEmailList,
  warnIfSuperAdminFallback
} from "./roles";

const originalSuper = process.env.SUPER_ADMIN_EMAILS;
const originalAdmin = process.env.ADMIN_EMAILS;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSuper === undefined) delete process.env.SUPER_ADMIN_EMAILS;
  else process.env.SUPER_ADMIN_EMAILS = originalSuper;
  if (originalAdmin === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = originalAdmin;
});

describe("staff role authorization", () => {
  it("normalizes configured email lists", () => {
    expect(parseEmailList(" Admin@Example.com, agent@example.com ,, ")).toEqual(
      new Set(["admin@example.com", "agent@example.com"])
    );
  });

  it("uses explicit super-admin configuration and rejects persisted escalation", () => {
    process.env.SUPER_ADMIN_EMAILS = "admin@example.com";
    process.env.ADMIN_EMAILS = "fallback@example.com";

    expect(isSuperAdminEmail(" ADMIN@example.com ")).toBe(true);
    expect(isSuperAdminEmail("fallback@example.com")).toBe(false);
    expect(effectiveStaffRole({ email: "admin@example.com", dbRole: "agent" })).toBe("super_admin");
    expect(effectiveStaffRole({ email: "other@example.com", dbRole: "super_admin" })).toBeNull();
  });

  it("warns when the legacy admin fallback grants super-admin access", () => {
    delete process.env.SUPER_ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "admin@example.com";
    const warn = vi.fn();

    warnIfSuperAdminFallback(process.env, warn);

    expect(warn).toHaveBeenCalledOnce();
  });

  it("blocks deactivated staff context and keeps non-staff users non-admin", () => {
    expect(isActiveStaff({ deactivatedAt: null })).toBe(true);
    expect(isActiveStaff({ deactivatedAt: new Date() })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { effectiveStaffRole, isActiveStaff, isSuperAdminEmail } from "@/lib/auth/roles";

describe("staff roles", () => {
  const prevSuper = process.env.SUPER_ADMIN_EMAILS;
  const prevAdmin = process.env.ADMIN_EMAILS;
  beforeEach(() => {
    process.env.SUPER_ADMIN_EMAILS = "boss@parkwise.eu";
    delete process.env.ADMIN_EMAILS;
  });
  afterEach(() => {
    process.env.SUPER_ADMIN_EMAILS = prevSuper;
    process.env.ADMIN_EMAILS = prevAdmin;
  });

  it("recognizes SUPER_ADMIN_EMAILS", () => {
    expect(isSuperAdminEmail("boss@parkwise.eu")).toBe(true);
    expect(isSuperAdminEmail("other@x.com")).toBe(false);
  });

  it("falls back to ADMIN_EMAILS when SUPER_ADMIN_EMAILS is empty", () => {
    process.env.SUPER_ADMIN_EMAILS = "";
    process.env.ADMIN_EMAILS = "legacy@parkwise.eu";
    expect(isSuperAdminEmail("legacy@parkwise.eu")).toBe(true);
    expect(isSuperAdminEmail("boss@parkwise.eu")).toBe(false);
  });

  it("env super wins over db agent role", () => {
    expect(effectiveStaffRole({ email: "boss@parkwise.eu", dbRole: "agent" })).toBe("super_admin");
  });

  it("returns db agent when not in env list", () => {
    expect(effectiveStaffRole({ email: "a@x.com", dbRole: "agent" })).toBe("agent");
  });

  it("db super_admin row grants nothing once the email leaves the env list", () => {
    expect(effectiveStaffRole({ email: "former@parkwise.eu", dbRole: "super_admin" })).toBe(null);
  });

  it("deactivated staff are rejected as assignment targets", () => {
    expect(isActiveStaff({ deactivatedAt: null })).toBe(true);
    expect(isActiveStaff({ deactivatedAt: new Date() })).toBe(false);
  });

  it("returns null for plain investors", () => {
    expect(effectiveStaffRole({ email: "i@x.com", dbRole: null })).toBe(null);
  });
});

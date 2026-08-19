import { describe, expect, it } from "vitest";
import { staffTwoFactorRequired } from "@/lib/auth/staff-two-factor";

describe("staffTwoFactorRequired", () => {
  it("never requires 2FA in demo mode", () => {
    expect(
      staffTwoFactorRequired({ demoMode: true, twoFactorEnabled: false, pathname: "/admin" })
    ).toBe(false);
  });

  it("requires 2FA outside demo when not enrolled", () => {
    expect(
      staffTwoFactorRequired({
        demoMode: false,
        twoFactorEnabled: false,
        pathname: "/admin/interests"
      })
    ).toBe(true);
  });

  it("does not redirect away from the enroll path", () => {
    expect(
      staffTwoFactorRequired({
        demoMode: false,
        twoFactorEnabled: false,
        pathname: "/portal/settings"
      })
    ).toBe(false);
  });

  it("does not require when already enrolled", () => {
    expect(
      staffTwoFactorRequired({
        demoMode: false,
        twoFactorEnabled: true,
        pathname: "/admin"
      })
    ).toBe(false);
  });
});

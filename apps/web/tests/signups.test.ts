import { describe, expect, it, vi } from "vitest";
import {
  areSignupsDisabled,
  isBootstrapSignupEmailAllowed,
  warnIfBootstrapSignupOpen
} from "@/lib/auth/signups";

describe("areSignupsDisabled", () => {
  it("is true by default (apply-first)", () => {
    expect(areSignupsDisabled({})).toBe(true);
    expect(areSignupsDisabled({ SIGNUPS_DISABLED: "false" })).toBe(true);
    expect(areSignupsDisabled({ SIGNUPS_DISABLED: "true" })).toBe(true);
  });

  it("opens only when ALLOW_BOOTSTRAP_SIGNUP=true", () => {
    expect(areSignupsDisabled({ ALLOW_BOOTSTRAP_SIGNUP: "true" })).toBe(false);
  });
});

describe("isBootstrapSignupEmailAllowed", () => {
  it("rejects everyone when bootstrap is closed", () => {
    expect(
      isBootstrapSignupEmailAllowed("ops@parkwise.eu", {
        SUPER_ADMIN_EMAILS: "ops@parkwise.eu"
      })
    ).toBe(false);
  });

  it("allows only SUPER_ADMIN_EMAILS when bootstrap is open", () => {
    const env = {
      ALLOW_BOOTSTRAP_SIGNUP: "true",
      SUPER_ADMIN_EMAILS: "ops@parkwise.eu, co@parkwise.eu"
    };
    expect(isBootstrapSignupEmailAllowed("ops@parkwise.eu", env)).toBe(true);
    expect(isBootstrapSignupEmailAllowed("OPS@parkwise.eu", env)).toBe(true);
    expect(isBootstrapSignupEmailAllowed("random@example.com", env)).toBe(false);
  });
});

describe("warnIfBootstrapSignupOpen", () => {
  it("warns when bootstrap signup is open", () => {
    const warn = vi.fn();

    warnIfBootstrapSignupOpen({ ALLOW_BOOTSTRAP_SIGNUP: "true" }, warn);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("ALLOW_BOOTSTRAP_SIGNUP");
  });

  it("stays silent when signups are disabled", () => {
    const warn = vi.fn();

    warnIfBootstrapSignupOpen({}, warn);

    expect(warn).not.toHaveBeenCalled();
  });
});

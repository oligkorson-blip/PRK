import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  areSignupsDisabled,
  isBootstrapSignupEmailAllowed,
} from "@/lib/auth/signups";
import { auth } from "@/lib/auth/auth";

describe("signup gating (lib/auth/signups)", () => {
  it("disables self-serve signup unless the bootstrap flag is exactly 'true'", () => {
    expect(areSignupsDisabled({})).toBe(true);
    expect(areSignupsDisabled({ ALLOW_BOOTSTRAP_SIGNUP: "false" })).toBe(true);
    expect(areSignupsDisabled({ ALLOW_BOOTSTRAP_SIGNUP: "yes" })).toBe(true);
    expect(areSignupsDisabled({ ALLOW_BOOTSTRAP_SIGNUP: "true" })).toBe(false);
  });

  it("allows no email while signups are disabled", () => {
    expect(
      isBootstrapSignupEmailAllowed("ops@example.com", {
        SUPER_ADMIN_EMAILS: "ops@example.com",
      })
    ).toBe(false);
  });

  it("during bootstrap allows only SUPER_ADMIN_EMAILS entries", () => {
    const env = {
      ALLOW_BOOTSTRAP_SIGNUP: "true",
      SUPER_ADMIN_EMAILS: "ops@example.com, second@example.com",
    };
    expect(isBootstrapSignupEmailAllowed("ops@example.com", env)).toBe(true);
    expect(isBootstrapSignupEmailAllowed("second@example.com", env)).toBe(true);
    expect(isBootstrapSignupEmailAllowed("investor@example.com", env)).toBe(false);
  });

  it("matches emails case-insensitively and trims whitespace", () => {
    const env = {
      ALLOW_BOOTSTRAP_SIGNUP: "true",
      SUPER_ADMIN_EMAILS: " ops@example.com ",
    };
    expect(isBootstrapSignupEmailAllowed(" Ops@Example.com ", env)).toBe(true);
  });

  it("falls back to ADMIN_EMAILS when SUPER_ADMIN_EMAILS is unset or blank", () => {
    expect(
      isBootstrapSignupEmailAllowed("ops@example.com", {
        ALLOW_BOOTSTRAP_SIGNUP: "true",
        ADMIN_EMAILS: "ops@example.com",
      })
    ).toBe(true);
    expect(
      isBootstrapSignupEmailAllowed("ops@example.com", {
        ALLOW_BOOTSTRAP_SIGNUP: "true",
        SUPER_ADMIN_EMAILS: "   ",
        ADMIN_EMAILS: "ops@example.com",
      })
    ).toBe(true);
    expect(
      isBootstrapSignupEmailAllowed("ops@example.com", {
        ALLOW_BOOTSTRAP_SIGNUP: "true",
        SUPER_ADMIN_EMAILS: "other@example.com",
        ADMIN_EMAILS: "ops@example.com",
      })
    ).toBe(false);
  });
});

describe("auth instance wiring (lib/auth/auth)", () => {
  it("exposes a request handler and an api surface", () => {
    expect(typeof auth.handler).toBe("function");
    expect(typeof auth.api).toBe("object");
  });

  it("enables email/password auth and wires the database hooks", () => {
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    // Bootstrap gate before user create, access-event record after session create.
    expect(typeof auth.options.databaseHooks?.user?.create?.before).toBe("function");
    expect(typeof auth.options.databaseHooks?.session?.create?.after).toBe("function");
  });

  it("throttles email sign-in with a custom rule tighter than the default", () => {
    expect(auth.options.rateLimit?.enabled).not.toBe(false);
    expect(auth.options.rateLimit?.customRules?.["/sign-in/email"]).toEqual({
      window: 60,
      max: 5
    });
  });

  it("throttles two-factor verification endpoints against code guessing", () => {
    expect(auth.options.rateLimit?.customRules?.["/two-factor/verify-totp"]).toEqual({
      window: 60,
      max: 5
    });
    expect(auth.options.rateLimit?.customRules?.["/two-factor/verify-backup-code"]).toEqual({
      window: 60,
      max: 5
    });
  });
});

describe("two-factor plugin wiring (lib/auth/auth)", () => {
  it("registers the twoFactor plugin with hardened lifetimes and encrypted backup codes", () => {
    const plugin = auth.options.plugins?.find((entry) => entry.id === "two-factor");
    expect(plugin).toBeDefined();
    expect(plugin?.options).toMatchObject({
      issuer: "Parkwise",
      twoFactorCookieMaxAge: 10 * 60,
      trustDeviceMaxAge: 7 * 24 * 60 * 60,
      backupCodeOptions: { storeBackupCodes: "encrypted" }
    });
  });

  it("keeps rate limiting in memory (no database storage, no verification hash switch)", () => {
    expect("storage" in (auth.options.rateLimit ?? {})).toBe(false);
    expect("verification" in auth.options).toBe(false);
  });

  it("exposes the two-factor endpoints on the api surface", () => {
    expect(typeof auth.api.enableTwoFactor).toBe("function");
    expect(typeof auth.api.verifyTOTP).toBe("function");
    expect(typeof auth.api.verifyBackupCode).toBe("function");
  });
});

describe("signup gating wiring (lib/auth/auth)", () => {
  const ENV_KEYS = ["ALLOW_BOOTSTRAP_SIGNUP"] as const;
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.resetModules();
  });

  // Fresh module evaluation of better-auth is slow; allow generous time.
  it(
    "gates signup via ALLOW_BOOTSTRAP_SIGNUP read at construction",
    { timeout: 30000 },
    async () => {
      let mod = await import("@/lib/auth/auth");
      expect(mod.auth.options.emailAndPassword?.disableSignUp).toBe(true);

      process.env.ALLOW_BOOTSTRAP_SIGNUP = "true";
      vi.resetModules();
      mod = await import("@/lib/auth/auth");
      expect(mod.auth.options.emailAndPassword?.disableSignUp).toBe(false);
    }
  );
});

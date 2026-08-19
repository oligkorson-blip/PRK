import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./validate-production-env.mjs";

function baseEnv(overrides = {}) {
  return {
    DATABASE_URL: "postgres://user:pass@db.example.com:5432/park",
    DOCUMENTS_DIR: "/var/lib/park/documents",
    DOCUMENTS_ENCRYPTION_KEY: "a".repeat(64),
    DEMO_MODE: "true",
    BETTER_AUTH_SECRET: "a-secret-that-is-long-enough-32-chars",
    BETTER_AUTH_URL: "https://app.example.com",
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    SUPER_ADMIN_EMAILS: "admin@example.com",
    ...overrides
  };
}

describe("validateEnvironment SMTP gate", () => {
  it.each(["false", "FALSE", "False", "0", " false "])(
    "requires SMTP_HOST when DEMO_MODE=%j (live)",
    (demoMode) => {
      const { errors } = validateEnvironment(baseEnv({ DEMO_MODE: demoMode }));
      expect(errors).toContain(
        "SMTP_HOST is required when DEMO_MODE=false so account recovery can work"
      );
    }
  );

  it.each(["true", "TRUE", "1", "yes"])(
    "does not require SMTP_HOST when DEMO_MODE=%j (demo)",
    (demoMode) => {
      const { errors } = validateEnvironment(baseEnv({ DEMO_MODE: demoMode }));
      expect(errors).not.toContain(
        "SMTP_HOST is required when DEMO_MODE=false so account recovery can work"
      );
    }
  );

  it("passes in live mode when the full SMTP quartet is set", () => {
    const { errors } = validateEnvironment(
      baseEnv({
        DEMO_MODE: "0",
        SMTP_HOST: "smtp.example.com",
        SMTP_FROM: "no-reply@example.com",
        SMTP_USER: "mailer@example.com",
        SMTP_PASS: "secret"
      })
    );
    expect(errors).toEqual([]);
  });

  it("requires SMTP_USER and SMTP_PASS in live mode when SMTP_HOST is set", () => {
    const { errors } = validateEnvironment(
      baseEnv({ DEMO_MODE: "0", SMTP_HOST: "smtp.example.com", SMTP_FROM: "no-reply@example.com" })
    );
    expect(errors).toContain("SMTP_USER is required when SMTP is enabled in live mode");
    expect(errors).toContain("SMTP_PASS is required when SMTP is enabled in live mode");
  });

  it("requires the rest of the quartet in live mode when only SMTP_USER is set", () => {
    const { errors } = validateEnvironment(baseEnv({ DEMO_MODE: "false", SMTP_USER: "mailer" }));
    expect(errors).toContain("SMTP_HOST is required when DEMO_MODE=false so account recovery can work");
    expect(errors).toContain("SMTP_FROM is required when SMTP is enabled");
    expect(errors).toContain("SMTP_PASS is required when SMTP is enabled in live mode");
  });

  it("still allows a pairwise USER/PASS config in demo mode", () => {
    const { errors } = validateEnvironment(
      baseEnv({
        DEMO_MODE: "true",
        SMTP_HOST: "smtp.example.com",
        SMTP_FROM: "no-reply@example.com",
        SMTP_USER: "mailer@example.com",
        SMTP_PASS: "secret"
      })
    );
    expect(errors).toEqual([]);
  });

  it("flags unpaired SMTP_USER/SMTP_PASS in demo mode", () => {
    const { errors } = validateEnvironment(
      baseEnv({ DEMO_MODE: "true", SMTP_HOST: "smtp.example.com", SMTP_FROM: "a@example.com", SMTP_USER: "mailer" })
    );
    expect(errors).toContain("SMTP_USER and SMTP_PASS must either both be set or both be omitted");
  });
});

describe("validateEnvironment document encryption gate", () => {
  const liveSmtp = {
    DEMO_MODE: "false",
    SMTP_HOST: "smtp.example.com",
    SMTP_FROM: "no-reply@example.com",
    SMTP_USER: "mailer@example.com",
    SMTP_PASS: "secret"
  };

  it("requires an encryption key in live mode", () => {
    const { errors } = validateEnvironment(
      baseEnv({ ...liveSmtp, DOCUMENTS_ENCRYPTION_KEY: "" })
    );

    expect(errors).toContain("DOCUMENTS_ENCRYPTION_KEY is required when DEMO_MODE=false");
  });

  it("allows an omitted encryption key in explicit demo mode", () => {
    const { errors } = validateEnvironment(
      baseEnv({ DEMO_MODE: "true", DOCUMENTS_ENCRYPTION_KEY: "" })
    );

    expect(errors).not.toContain("DOCUMENTS_ENCRYPTION_KEY is required when DEMO_MODE=false");
  });

  it.each(["not-a-key", "a".repeat(63), Buffer.alloc(31).toString("base64")])(
    "rejects malformed encryption key %j",
    (encryptionKey) => {
      const { errors } = validateEnvironment(
        baseEnv({ ...liveSmtp, DOCUMENTS_ENCRYPTION_KEY: encryptionKey })
      );

      expect(errors).toContain(
        "DOCUMENTS_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64"
      );
    }
  );

  it.each(["b".repeat(64), Buffer.alloc(32, 7).toString("base64")])(
    "accepts valid encryption key %j",
    (encryptionKey) => {
      const { errors } = validateEnvironment(
        baseEnv({ ...liveSmtp, DOCUMENTS_ENCRYPTION_KEY: encryptionKey })
      );

      expect(errors).toEqual([]);
    }
  );
});

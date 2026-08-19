import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
  default: { createTransport }
}));

function recipientLogId(to: string): string {
  return createHash("sha256").update(to.trim().toLowerCase()).digest("hex").slice(0, 12);
}

describe("sendTransactionalEmail", () => {
  const envKeys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SMTP_SECURE",
    "DEMO_MODE"
  ] as const;
  const saved: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    sendMail.mockReset();
    createTransport.mockClear();
    sendMail.mockResolvedValue({ messageId: "test" });
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  });

  it("skips when SMTP_HOST is unset", async () => {
    const { sendTransactionalEmail, isSmtpConfigured } = await import("./send");
    expect(isSmtpConfigured()).toBe(false);
    const result = await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Hello",
      text: "Body"
    });
    expect(result).toEqual({ sent: false, skipped: true });
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("logs production skip when DEMO_MODE=false and SMTP unset", async () => {
    process.env.DEMO_MODE = "false";
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendTransactionalEmail } = await import("./send");
    const result = await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Hello",
      text: "Body"
    });
    expect(result).toEqual({ sent: false, skipped: true });
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[email:skip:production]"),
      expect.any(String),
      recipientLogId("a@example.com")
    );
    errSpy.mockRestore();
  });

  it("sends via nodemailer when SMTP_HOST is set", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "Parkwise <ops@example.com>";

    const { sendTransactionalEmail, isSmtpConfigured } = await import("./send");
    expect(isSmtpConfigured()).toBe(true);

    const result = await sendTransactionalEmail({
      to: "investor@example.com",
      subject: "Distribution recorded",
      text: "€100 credited"
    });

    expect(result).toEqual({ sent: true });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        secure: false,
        requireTLS: true,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
        auth: { user: "mailer@example.com", pass: "secret" }
      })
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Parkwise <ops@example.com>",
        to: "investor@example.com",
        subject: "Distribution recorded",
        text: "€100 credited"
      })
    );
  });

  it("passes replyTo through to nodemailer when provided", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "Parkwise <noreply@example.com>";

    const { sendTransactionalEmail } = await import("./send");
    const result = await sendTransactionalEmail({
      to: "investor@example.com",
      subject: "Update on your interest",
      text: "Questions? Just reply to this email.",
      replyTo: "ops@example.com"
    });

    expect(result).toEqual({ sent: true });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Parkwise <noreply@example.com>",
        to: "investor@example.com",
        replyTo: "ops@example.com"
      })
    );
  });

  it("returns sent:false when transport throws", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "Parkwise <ops@example.com>";
    sendMail.mockRejectedValueOnce(new Error("relay denied"));

    const { sendTransactionalEmail } = await import("./send");
    const result = await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Hello",
      text: "Body"
    });
    expect(result).toEqual({ sent: false, skipped: false });
  });

  it.each([
    ["SMTP_FROM", { SMTP_USER: "mailer@example.com", SMTP_PASS: "secret" }],
    ["SMTP_USER", { SMTP_FROM: "Parkwise <ops@example.com>", SMTP_PASS: "secret" }],
    ["SMTP_PASS", { SMTP_FROM: "Parkwise <ops@example.com>", SMTP_USER: "mailer@example.com" }]
  ])("fails fast when %s is missing from the SMTP quartet", async (_missing, env) => {
    process.env.SMTP_HOST = "smtp.example.com";
    for (const [key, value] of Object.entries(env)) process.env[key] = value;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { sendTransactionalEmail } = await import("./send");
    const result = await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Hello",
      text: "Body"
    });

    expect(result).toEqual({ sent: false, skipped: false });
    expect(createTransport).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[email:config]"),
      expect.any(String),
      recipientLogId("a@example.com")
    );
    errSpy.mockRestore();
  });

  it("never logs the raw recipient address or subject", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "Parkwise <ops@example.com>";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const { sendTransactionalEmail } = await import("./send");
    await sendTransactionalEmail({
      to: "investor@example.com",
      subject: "Distribution recorded",
      text: "€100 credited"
    });

    const logged = infoSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("investor@example.com");
    expect(logged).not.toContain("Distribution recorded");
    expect(logged).toContain(recipientLogId("investor@example.com"));
    infoSpy.mockRestore();
  });
});

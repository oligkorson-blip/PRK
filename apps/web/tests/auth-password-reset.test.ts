import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendTransactionalEmail } from "@/lib/email/send";
import { auth } from "@/lib/auth/auth";

vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: vi.fn()
}));

const sendMock = vi.mocked(sendTransactionalEmail);

const user = {
  id: "user-1",
  email: "investor@example.com",
  name: "Investor",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

const resetUrl = "https://parkwise.example/reset-password?token=abc123";

describe("password reset wiring (lib/auth/auth)", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("enforces the password policy the reset and set-password pages advertise", () => {
    expect(auth.options.emailAndPassword?.minPasswordLength).toBe(10);
    expect(auth.options.emailAndPassword?.maxPasswordLength).toBe(128);
  });

  it("expires reset tokens after 60 minutes and revokes sessions on reset", () => {
    expect(auth.options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(60 * 60);
    expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });

  it("rate-limits the unauthenticated reset endpoints below the global default", () => {
    const rules = auth.options.rateLimit?.customRules;
    expect(rules?.["/request-password-reset"]).toEqual({ window: 60, max: 3 });
    expect(rules?.["/reset-password"]).toEqual({ window: 300, max: 5 });
  });

  it("sends the reset link through the transactional email helper", { timeout: 30000 }, async () => {
    sendMock.mockResolvedValue({ sent: true });
    const send = auth.options.emailAndPassword?.sendResetPassword;
    expect(typeof send).toBe("function");

    await send!({ user, url: resetUrl, token: "abc123" });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      to: "investor@example.com",
      subject: "Reset your Parkwise password",
      text: expect.stringContaining(resetUrl)
    });
  });

  it(
    "does not await email delivery, so response timing cannot reveal registered emails",
    { timeout: 30000 },
    async () => {
      // A delivery promise that never settles: if sendResetPassword awaited it,
      // this test would time out instead of resolving.
      sendMock.mockReturnValue(new Promise(() => {}));
      const send = auth.options.emailAndPassword?.sendResetPassword;

      await expect(send!({ user, url: resetUrl, token: "abc123" })).resolves.toBeUndefined();
      expect(sendMock).toHaveBeenCalledTimes(1);
    }
  );
});

import { describe, expect, it } from "vitest";
import { FORGOT_PASSWORD_ERROR, requestPasswordResetSafely } from "@/lib/auth/forgot-password";
import {
  INVITE_NOT_READY_ERROR,
  PASSWORD_UPDATE_ERROR,
  RESET_PASSWORD_CONNECTION_ERROR,
  SET_PASSWORD_CONNECTION_ERROR,
  SIGN_IN_CONNECTION_ERROR,
  SIGN_UP_CONNECTION_ERROR
} from "@/lib/auth/connection-copy";
import { friendlySignInError } from "@/lib/auth/sign-in-errors";

describe("requestPasswordResetSafely", () => {
  it("resolves sent when delivery succeeds", async () => {
    await expect(requestPasswordResetSafely(async () => undefined)).resolves.toEqual({
      sent: true
    });
  });

  it("maps a thrown transport error to the generic copy", async () => {
    const result = await requestPasswordResetSafely(async () => {
      throw new Error("SMTP connection refused");
    });

    expect(result).toEqual({ sent: false, error: FORGOT_PASSWORD_ERROR });
  });

  it("generic copy gives a clear recovery path", () => {
    expect(FORGOT_PASSWORD_ERROR).toBe(
      "We couldn't send the reset link just yet. Try again, or email contact@parkwise.eu if it continues."
    );
  });
});

describe("connection failure copy", () => {
  it("gives sign-in and sign-up users a clear next step", () => {
    expect(SIGN_IN_CONNECTION_ERROR).toBe(
      "We couldn’t sign you in just yet. Check your connection and try again, or contact the team if it continues."
    );
    expect(SIGN_UP_CONNECTION_ERROR).toBe(
      "We couldn’t create your account just yet. Check your connection and try again, or contact the team if it continues."
    );
    expect(RESET_PASSWORD_CONNECTION_ERROR).toBe(
      "We couldn't reset your password just yet. Check your connection and try again, or contact the team if it continues."
    );
    expect(SET_PASSWORD_CONNECTION_ERROR).toBe(
      "We couldn't save your password just yet. Check your connection and try again, or contact the team if it continues."
    );
    expect(INVITE_NOT_READY_ERROR).toBe(
      "Your invitation is not ready just yet. Contact the team and we'll help you get set up."
    );
    expect(PASSWORD_UPDATE_ERROR).toBe(
      "We couldn't update your password just yet. Please try again, or contact the team if it continues."
    );
  });
});

describe("friendlySignInError", () => {
  it("maps known Better Auth codes to friendly copy", () => {
    expect(friendlySignInError({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "Incorrect email or password."
    );
    expect(friendlySignInError({ code: "EMAIL_NOT_VERIFIED" })).toBe(
      "Verify your email address before signing in."
    );
    expect(friendlySignInError({ code: "TOO_MANY_REQUESTS" })).toBe(
      "Too many attempts. Wait a minute and try again."
    );
  });

  it("falls back to generic copy for unknown codes, raw messages, and null", () => {
    const fallback = "We couldn’t sign you in. Check your details and try again, or contact the team.";
    expect(friendlySignInError({ code: "SOMETHING_ELSE", message: "raw db error" })).toBe(fallback);
    expect(friendlySignInError({ message: "raw only" })).toBe(fallback);
    expect(friendlySignInError(null)).toBe(fallback);
  });
});
import { describe, expect, it } from "vitest";
import {
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH
} from "@/lib/auth/password-policy";
import { auth } from "@/lib/auth/auth";

describe("password policy constants", () => {
  it("are min 10 / max 128", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(PASSWORD_HINT).toBe("Use at least 10 characters.");
  });

  it("match the better-auth server policy (single source of truth)", () => {
    expect(auth.options.emailAndPassword?.minPasswordLength).toBe(PASSWORD_MIN_LENGTH);
    expect(auth.options.emailAndPassword?.maxPasswordLength).toBe(PASSWORD_MAX_LENGTH);
  });
});

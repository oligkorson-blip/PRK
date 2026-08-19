/**
 * Single source of truth for the password policy. Better Auth
 * (lib/auth/auth.ts) and every new-password form (sign-up, set-password,
 * reset-password) must use these constants so client and server stay aligned.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_HINT = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;

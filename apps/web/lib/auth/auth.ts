import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { recordAccessEvent } from "@/lib/access/record";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { isAuthRateLimitEnabled } from "@/lib/auth/rate-limit-enabled";
import { areSignupsDisabled, isBootstrapSignupEmailAllowed } from "@/lib/auth/signups";
import { sendTransactionalEmail } from "@/lib/email/send";

// A forwarded IP header is only resolved right-to-left past trusted proxy hops,
// so a forged X-Forwarded-For prefix is ignored. The app sits behind
// Coolify/Traefik on the same host (docs/DEPLOY_NJALLA_COOLIFY.md), which makes
// loopback the only trusted hop by default; override with a comma-separated
// TRUSTED_PROXIES list if the proxy topology changes.
const trustedProxies = (process.env.TRUSTED_PROXIES ?? "127.0.0.1,::1")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  advanced: {
    ipAddress: {
      trustedProxies
    }
  },
  emailAndPassword: {
    enabled: true,
    // Email verification is intentionally off while signup is limited to the
    // SUPER_ADMIN_EMAILS bootstrap. If signup ever opens beyond bootstrap (see
    // areSignupsDisabled in lib/auth/signups.ts), enable requireEmailVerification
    // and sendVerificationEmail first so unverified addresses cannot sign in.
    disableSignUp: areSignupsDisabled(),
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Do not await delivery: response timing must not reveal whether an
      // unauthenticated email address exists. The self-hosted process remains
      // alive for the background SMTP attempt, whose helper catches failures.
      void sendTransactionalEmail({
        to: user.email,
        subject: "Reset your Parkwise password",
        text: [
          "A password reset was requested for your Parkwise account.",
          `Use this single-use link within 60 minutes: ${url}`,
          "If you did not request this, you can ignore this email."
        ].join("\n\n")
      });
    }
  },
  rateLimit: {
    enabled: isAuthRateLimitEnabled(),
    customRules: {
      // Credential-stuffing cap: tighter than the global default (100 req/10s,
      // in-memory per instance; enabled in production — see better-auth docs).
      "/sign-in/email": { window: 60, max: 5 },
      // Reset endpoints are unauthenticated and trigger outbound email, so cap
      // them tighter still against mail-bombing and token guessing.
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 300, max: 5 },
      // TOTP/backup-code guessing caps: 6-digit codes stay brute-forceable
      // without a tight per-window limit, and these endpoints sit behind only
      // the short-lived two-factor cookie.
      "/two-factor/verify-totp": { window: 60, max: 5 },
      "/two-factor/verify-backup-code": { window: 60, max: 5 }
    }
  },
  plugins: [
    twoFactor({
      issuer: "Parkwise",
      // The pending-verification cookie outlives only a single sign-in attempt;
      // trusted devices expire after a week so a stolen cookie ages out quickly.
      twoFactorCookieMaxAge: 10 * 60,
      trustDeviceMaxAge: 7 * 24 * 60 * 60,
      // Backup codes are one-time bearer material, so they are stored encrypted
      // rather than readable alongside the TOTP secret in a database dump.
      backupCodeOptions: { storeBackupCodes: "encrypted" }
    })
  ],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!areSignupsDisabled() && !isBootstrapSignupEmailAllowed(user.email)) {
            throw new Error(
              "Bootstrap signup is limited to SUPER_ADMIN_EMAILS. Unset ALLOW_BOOTSTRAP_SIGNUP after the first ops account."
            );
          }
          return { data: user };
        }
      }
    },
    session: {
      create: {
        after: async (session) => {
          await recordAccessEvent({
            authUserId: session.userId,
            ipAddress: session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
            sessionId: session.id
          });
        }
      }
    }
  }
});

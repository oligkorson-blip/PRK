import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for resolveSignInErrorMessage (lib/apply/sign-in-hint.ts): a credential
 * rate limit must take precedence over the pending-application hint, with the
 * hint fetch skipped entirely.
 *
 * The db is mocked as a chainable thenable (same pattern as sign-in-hint.test.ts):
 * every drizzle method returns the same proxy and each `await` shifts the next
 * queued result. headers() returns no IP so the throttle passes.
 */
const h = vi.hoisted(() => {
  type QueueEntry = { value?: unknown; throw?: unknown };
  const dbQueue: QueueEntry[] = [];

  function chainable(): unknown {
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === "then") {
          return (
            onFulfilled?: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown
          ) => {
            const entry = dbQueue.shift();
            const settled =
              entry && "throw" in entry
                ? Promise.reject(entry.throw)
                : Promise.resolve(entry?.value);
            return settled.then(onFulfilled, onRejected);
          };
        }
        return () => proxy;
      }
    });
    return proxy;
  }

  return { dbQueue, chainable };
});

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null })
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (left: unknown, right: unknown) => ({ eq: [left, right] }),
  sql: (_strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: values })
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => h.chainable()
  },
  investors: {}
}));

import { resolveSignInErrorMessage } from "@/lib/apply/sign-in-hint";

const pendingInvestor = { accountStatus: "pending_access", authUserId: null };

beforeEach(() => {
  h.dbQueue.length = 0;
});

describe("resolveSignInErrorMessage", () => {
  it("shows the pending-application hint when credentials fail", async () => {
    h.dbQueue.push({ value: [pendingInvestor] });

    await expect(
      resolveSignInErrorMessage("ada@example.com", { code: "INVALID_EMAIL_OR_PASSWORD" })
    ).resolves.toBe("Your application is under review.");
  });

  it("falls back to friendly copy when there is no hint", async () => {
    h.dbQueue.push({ value: [] });

    await expect(
      resolveSignInErrorMessage("ada@example.com", { code: "INVALID_EMAIL_OR_PASSWORD" })
    ).resolves.toBe("Incorrect email or password.");
  });

  it("rate limit takes precedence over the hint — the hint is not even fetched", async () => {
    await expect(
      resolveSignInErrorMessage("ada@example.com", { code: "TOO_MANY_REQUESTS" })
    ).resolves.toBe("Too many attempts. Wait a minute and try again.");
    // No db query ran — the hint lookup was skipped, not just overridden.
    expect(h.dbQueue).toHaveLength(0);
  });

  it("maps unknown codes to the generic fallback", async () => {
    h.dbQueue.push({ value: [] });

    await expect(
      resolveSignInErrorMessage("ada@example.com", { code: "SOMETHING_ELSE", message: "raw" })
    ).resolves.toBe("We couldn’t sign you in. Check your details and try again, or contact the team.");
  });
});
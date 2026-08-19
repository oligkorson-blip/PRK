import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for getSignInHint (lib/apply/sign-in-hint.ts), focused on the per-IP
 * throttle: a throttled caller must get the same null as a non-pending email
 * so the hint can't be used as an oracle amplifier.
 *
 * The db is mocked as a chainable thenable (same pattern as actions.test.ts):
 * every drizzle method returns the same proxy and each `await` shifts the next
 * queued result. The real ip-throttle module is used, so each test picks a
 * distinct IP — the throttle map is module-level state for the whole file.
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

  return {
    dbQueue,
    chainable,
    headersGet: vi.fn((_name: string): string | null => null)
  };
});

vi.mock("next/headers", () => ({
  headers: async () => ({ get: h.headersGet })
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

import { getSignInHint } from "@/lib/apply/sign-in-hint";
import { IP_THROTTLE_MAX_PER_WINDOW } from "@/lib/apply/ip-throttle";

const pendingInvestor = { accountStatus: "pending_access", authUserId: null };

beforeEach(() => {
  h.dbQueue.length = 0;
  h.headersGet.mockReset();
  h.headersGet.mockReturnValue(null);
});

describe("getSignInHint", () => {
  it("returns the review hint for a pending application without an auth user", async () => {
    h.dbQueue.push({ value: [pendingInvestor] });
    await expect(getSignInHint("Ada@Example.com ")).resolves.toBe(
      "Your application is under review."
    );
  });

  it("returns null when the email is blank, without querying the db", async () => {
    await expect(getSignInHint("   ")).resolves.toBe(null);
    expect(h.dbQueue).toHaveLength(0);
  });

  it("returns null for active accounts and unknown emails", async () => {
    h.dbQueue.push({ value: [{ accountStatus: "active", authUserId: "user1" }] });
    await expect(getSignInHint("active@example.com")).resolves.toBe(null);

    h.dbQueue.push({ value: [] });
    await expect(getSignInHint("nobody@example.com")).resolves.toBe(null);
  });

  it("returns null once the caller's IP exhausts the throttle window, without querying the db", async () => {
    h.headersGet.mockReturnValue("203.0.113.50");
    for (let i = 0; i < IP_THROTTLE_MAX_PER_WINDOW; i++) {
      h.dbQueue.push({ value: [pendingInvestor] });
      await expect(getSignInHint("ada@example.com")).resolves.toBe(
        "Your application is under review."
      );
    }

    // Throttled: same generic null as a non-pending email, and no db query runs.
    await expect(getSignInHint("ada@example.com")).resolves.toBe(null);
    expect(h.dbQueue).toHaveLength(0);
  });

  it("tracks IPs independently — a throttled IP does not block others", async () => {
    h.headersGet.mockReturnValue("203.0.113.60");
    for (let i = 0; i < IP_THROTTLE_MAX_PER_WINDOW; i++) {
      h.dbQueue.push({ value: [] });
      await getSignInHint("ada@example.com");
    }

    h.headersGet.mockReturnValue("203.0.113.61");
    h.dbQueue.push({ value: [pendingInvestor] });
    await expect(getSignInHint("ada@example.com")).resolves.toBe(
      "Your application is under review."
    );
  });

  it("passes the throttle when no IP header is present", async () => {
    for (let i = 0; i < IP_THROTTLE_MAX_PER_WINDOW + 2; i++) {
      h.dbQueue.push({ value: [pendingInvestor] });
      await expect(getSignInHint("ada@example.com")).resolves.toBe(
        "Your application is under review."
      );
    }
  });
});

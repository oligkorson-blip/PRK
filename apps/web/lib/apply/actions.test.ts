import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Focused tests for submitApplication's confirmation-email gating (the public
 * form must not act as a mail relay) and firstName sanitization.
 *
 * The db is mocked as a chainable thenable: every drizzle method returns the
 * same proxy, and each `await` shifts the next queued result, matching the
 * strictly sequential queries in lib/apply/actions.ts.
 */
const h = vi.hoisted(() => {
  type QueueEntry = { value?: unknown; throw?: unknown };
  const dbQueue: QueueEntry[] = [];
  const valuesCalls: unknown[] = [];
  const setCalls: unknown[] = [];

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
        if (prop === "values") {
          return (value: unknown) => {
            valuesCalls.push(value);
            return proxy;
          };
        }
        if (prop === "set") {
          return (value: unknown) => {
            setCalls.push(value);
            return proxy;
          };
        }
        return () => proxy;
      }
    });
    return proxy;
  }

  return {
    dbQueue,
    valuesCalls,
    setCalls,
    chainable,
    sendTransactionalEmail: vi.fn(),
    headersGet: vi.fn((_name: string): string | null => null)
  };
});

vi.mock("next/headers", () => ({
  headers: async () => ({ get: h.headersGet })
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  asc: (col: unknown) => ({ asc: col }),
  eq: (left: unknown, right: unknown) => ({ eq: [left, right] }),
  gte: (left: unknown, right: unknown) => ({ gte: [left, right] }),
  isNull: (col: unknown) => ({ isNull: col }),
  sql: (_strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: values })
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => h.chainable(),
    insert: () => h.chainable(),
    update: () => h.chainable(),
    transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        select: () => h.chainable(),
        insert: () => h.chainable(),
        update: () => h.chainable()
      })
  },
  auditEvents: {},
  investorApplications: {},
  investors: {},
  leadLists: {},
  leads: {},
  staffProfiles: {}
}));

vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: h.sendTransactionalEmail
}));

import { submitApplication } from "@/lib/apply/actions";
import type { ApplicationInput } from "@/lib/apply/validation";

const baseInput: ApplicationInput = {
  accountType: "individual",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+353 1 234 5678",
  countryOfResidence: "Ireland",
  termsAccepted: true,
  riskAccepted: true
};

beforeEach(() => {
  h.dbQueue.length = 0;
  h.valuesCalls.length = 0;
  h.setCalls.length = 0;
  h.sendTransactionalEmail.mockReset();
  h.sendTransactionalEmail.mockResolvedValue({ sent: true });
  h.headersGet.mockReturnValue(null);
});

describe("submitApplication confirmation email", () => {
  it("emails once when a new application row is created", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions for the per-email cap
      { value: [] }, // existing investor lookup — none
      { value: [{ id: "inv1" }] }, // insert investors .returning()
      { value: [{ id: "staff1" }] }, // super_admin lookup
      { value: [] }, // "Inbound applications" list lookup — missing
      { value: [{ id: "list1" }] }, // insert leadLists .returning()
      { value: [{ id: "lead1" }] }, // insert leads .returning()
      { value: [{ id: "app1" }] } // insert investorApplications .returning()
    );

    const result = await submitApplication(baseInput);

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    expect(h.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(h.sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ada@example.com" })
    );
  });

  it("does not email on the idempotent already-pending resubmit", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions for the per-email cap
      { value: [{ id: "inv1", accountStatus: "pending_access" }] }, // existing investor
      { value: [{ id: "app1" }] } // open application found
    );

    const result = await submitApplication(baseInput);

    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    expect(h.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("treats an already-pending resubmit as a no-op: no writes, no consent re-stamp", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions for the per-email cap
      {
        value: [
          {
            id: "inv1",
            accountStatus: "pending_access",
            termsAcceptedAt: new Date("2026-01-01T00:00:00Z"),
            riskAcceptedAt: new Date("2026-01-01T00:00:00Z")
          }
        ]
      }, // existing investor
      { value: [{ id: "app1", status: "submitted" }] } // open application found
    );

    const result = await submitApplication({
      ...baseInput,
      firstName: "Mallory",
      phone: "+1 555 000 0000",
      countryOfResidence: "France"
    });

    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    // The application and investor rows are left untouched — no update .set()
    // (so no PII overwrite and no termsAcceptedAt/riskAcceptedAt re-stamp) and
    // no new rows inserted.
    expect(h.setCalls).toHaveLength(0);
    expect(h.valuesCalls).toHaveLength(0);
    expect(h.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("does not email when the same-email insert race is lost", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions for the per-email cap
      { value: [] }, // existing investor lookup — none
      {
        throw: Object.assign(new Error("duplicate key"), {
          code: "23505",
          constraint: "investors_email_lower_uidx"
        })
      } // insert investors loses the race
    );

    const result = await submitApplication(baseInput);

    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    expect(h.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("strips control characters from firstName in the email body", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions
      { value: [] }, // existing investor
      { value: [{ id: "inv1" }] }, // insert investors
      { value: [] }, // super_admin lookup — nobody, skip lead list
      { value: [{ id: "app1" }] } // insert investorApplications
    );

    const result = await submitApplication({
      ...baseInput,
      firstName: "Ada\nBcc: attacker@example.com"
    });

    expect(result.ok).toBe(true);
    expect(h.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const { text } = h.sendTransactionalEmail.mock.calls[0]?.[0] as { text: string };
    expect(text.split("\n")[0]).toBe("Hi AdaBcc: attacker@example.com,");
  });

  it("uses team-facing copy when an existing account cannot apply", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions for the per-email cap
      { value: [{ id: "inv1", accountStatus: "active" }] } // existing account
    );

    const result = await submitApplication(baseInput);

    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    expect(h.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("uses a helpful fallback when submission fails unexpectedly", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions for the per-email cap
      { throw: new Error("database unavailable") } // existing investor lookup fails
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await submitApplication(baseInput);

    expect(result).toEqual({
      ok: false,
      error:
        "We couldn't submit your application just yet. Please try again, or contact the team if it continues."
    });
    errorSpy.mockRestore();
  });

  it("creates the inbound lead already converted when linked to the new investor", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions for the per-email cap
      { value: [] }, // existing investor lookup — none
      { value: [{ id: "inv1" }] }, // insert investors .returning()
      { value: [{ id: "staff1" }] }, // super_admin lookup
      { value: [{ id: "list1" }] }, // "Inbound applications" list found
      { value: [{ id: "lead1" }] }, // insert leads .returning()
      { value: [{ id: "app1" }] } // insert investorApplications .returning()
    );

    const result = await submitApplication(baseInput);

    expect(result.ok).toBe(true);
    const leadInsert = h.valuesCalls.find(
      (value) => typeof value === "object" && value !== null && "listId" in value
    );
    expect(leadInsert).toMatchObject({ investorId: "inv1", status: "converted" });
  });

  it("adopts a pre-existing same-email lead instead of failing the submission", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions for the per-email cap
      { value: [] }, // existing investor lookup — none
      { value: [{ id: "inv1" }] }, // insert investors .returning()
      { value: [{ id: "staff1" }] }, // super_admin lookup
      { value: [{ id: "list1" }] }, // "Inbound applications" list found
      { value: [] }, // conflict-safe lead insert returns no row
      {
        value: [{ id: "lead-existing", investorId: null }]
      }, // lock the pre-existing lead by list + email
      { value: [{ id: "lead-existing" }] }, // update leads — adopt/link the row
      { value: [{ id: "app1" }] } // insert investorApplications .returning()
    );

    const result = await submitApplication(baseInput);

    // The submission succeeds and the application row is written, linked to
    // the adopted lead — the generic response reveals nothing about the
    // pre-existing lead.
    expect(result).toMatchObject({ ok: true });
    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    // No duplicate lead row: exactly one lead insert was attempted, and the
    // pre-existing row was adopted via an update that links it converted.
    const leadInserts = h.valuesCalls.filter(
      (value) => typeof value === "object" && value !== null && "listId" in value
    );
    expect(leadInserts).toHaveLength(1);
    expect(h.setCalls).toContainEqual(
      expect.objectContaining({ investorId: "inv1", status: "converted" })
    );
    const appInsert = h.valuesCalls.find(
      (value) => typeof value === "object" && value !== null && "investorId" in value && !("listId" in value)
    );
    expect(appInsert).toMatchObject({ investorId: "inv1", leadId: "lead-existing" });
    expect(h.sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("does not link a lead already owned by another investor", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions for the per-email cap
      { value: [] }, // existing investor lookup — none
      { value: [{ id: "inv1" }] }, // insert investors .returning()
      { value: [{ id: "staff1" }] }, // super_admin lookup
      { value: [{ id: "list1" }] }, // "Inbound applications" list found
      { value: [] }, // conflict-safe lead insert returns no row
      {
        value: [{ id: "lead-other", investorId: "inv-other" }]
      }, // winner is already linked to another investor
      { value: [{ id: "app1" }] } // insert investorApplications .returning()
    );

    const result = await submitApplication(baseInput);

    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    const appInsert = h.valuesCalls.find(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "investorId" in value &&
        !("listId" in value)
    );
    expect(appInsert).toMatchObject({ investorId: "inv1", leadId: null });
    expect(h.setCalls).toHaveLength(0);
    expect(h.sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite an account activated after the preflight lookup", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions
      { value: [{ id: "inv1", accountStatus: "pending_access" }] }, // preflight investor
      { value: [] }, // preflight open application
      { value: [] }, // locked linked leads
      { value: [{ id: "inv1", accountStatus: "active" }] } // locked investor
    );

    const result = await submitApplication(baseInput);

    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    expect(h.setCalls).toHaveLength(0);
    expect(h.valuesCalls).toHaveLength(0);
    expect(h.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("does not create a second application when one appears after preflight", async () => {
    h.dbQueue.push(
      { value: [] }, // recent submissions
      { value: [{ id: "inv1", accountStatus: "pending_access" }] }, // preflight investor
      { value: [] }, // preflight open application
      { value: [] }, // locked linked leads
      { value: [{ id: "inv1", accountStatus: "pending_access" }] }, // locked investor
      { value: [{ id: "app2", status: "submitted" }] } // locked open application check
    );

    const result = await submitApplication(baseInput);

    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    expect(h.setCalls).toHaveLength(0);
    expect(h.valuesCalls).toHaveLength(0);
    expect(h.sendTransactionalEmail).not.toHaveBeenCalled();
  });

});
import { describe, expect, it } from "vitest";
import {
  linkLeadOnInvestorCreate,
  orderLeadsForEmailMatch,
  pickLeadForEmailMatch,
} from "@/lib/leads/link";

describe("pickLeadForEmailMatch", () => {
  it("returns null for an empty list", () => {
    expect(pickLeadForEmailMatch([])).toBeNull();
  });

  it("prefers the most recently assigned lead over newer unassigned ones", () => {
    const picked = pickLeadForEmailMatch([
      {
        id: "unassigned-newest",
        assignedAgentId: null,
        ibId: null,
        createdAt: new Date("2026-07-18T12:00:00Z"),
      },
      {
        id: "assigned-older",
        assignedAgentId: "agent-1",
        ibId: "ib-1",
        createdAt: new Date("2026-07-10T12:00:00Z"),
      },
      {
        id: "assigned-newest",
        assignedAgentId: "agent-2",
        ibId: "ib-1",
        createdAt: new Date("2026-07-15T12:00:00Z"),
      },
    ]);

    expect(picked?.id).toBe("assigned-newest");
  });

  it("falls back to newest createdAt when none are assigned", () => {
    const picked = pickLeadForEmailMatch([
      {
        id: "older",
        assignedAgentId: null,
        ibId: null,
        createdAt: new Date("2026-07-01T12:00:00Z"),
      },
      {
        id: "newest",
        assignedAgentId: null,
        ibId: null,
        createdAt: new Date("2026-07-18T12:00:00Z"),
      },
    ]);

    expect(picked?.id).toBe("newest");
  });
});

describe("orderLeadsForEmailMatch", () => {
  it("orders assigned leads newest-first for race retries", () => {
    const ordered = orderLeadsForEmailMatch([
      {
        id: "unassigned-newest",
        assignedAgentId: null,
        ibId: null,
        createdAt: new Date("2026-07-18T12:00:00Z"),
      },
      {
        id: "assigned-older",
        assignedAgentId: "agent-1",
        ibId: "ib-1",
        createdAt: new Date("2026-07-10T12:00:00Z"),
      },
      {
        id: "assigned-newest",
        assignedAgentId: "agent-2",
        ibId: "ib-1",
        createdAt: new Date("2026-07-15T12:00:00Z"),
      },
    ]);

    expect(ordered.map((lead) => lead.id)).toEqual([
      "assigned-newest",
      "assigned-older",
    ]);
  });
});

type FakeLead = {
  id: string;
  status?: string;
  assignedAgentId: string | null;
  ibId: string | null;
  createdAt: Date;
};

/** Minimal stand-in for the Drizzle handle that records every mutation. */
function createRecordingTx(
  candidates: FakeLead[],
  options: { investorAlreadyAssigned?: boolean } = {}
) {
  const updates: Array<Record<string, unknown>> = [];
  const auditInserts: Array<Record<string, unknown>> = [];
  let updateCalls = 0;

  const tx = {
    select: () => ({
      from: () => ({
        // Models the match query's exclusion of terminal-status leads.
        where: async () =>
          candidates.filter(
            (lead) =>
              !["unqualified", "duplicate", "converted"].includes(
                lead.status ?? "new"
              )
          ),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        updateCalls += 1;
        const isLeadUpdate = updateCalls === 1;
        return {
          where: () =>
            Object.assign(Promise.resolve(undefined), {
              returning: async () => {
                if (isLeadUpdate) {
                  return [{ id: candidates[0]?.id ?? "lead-1" }];
                }
                // Models the isNull(investors.assignedAgentId) guard: an
                // already-assigned investor is filtered out of the update.
                return options.investorAlreadyAssigned ? [] : [{ id: "inv-1" }];
              },
            }),
        };
      },
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        auditInserts.push(values);
      },
    }),
  };

  return { tx, updates, auditInserts };
}

type TxParam = Parameters<typeof linkLeadOnInvestorCreate>[0];

describe("linkLeadOnInvestorCreate", () => {
  it("marks the matched lead as converted", async () => {
    const { tx, updates } = createRecordingTx([
      {
        id: "lead-1",
        assignedAgentId: "agent-1",
        ibId: "ib-1",
        createdAt: new Date("2026-07-01T12:00:00Z"),
      },
    ]);

    const result = await linkLeadOnInvestorCreate(
      tx as unknown as TxParam,
      { id: "inv-1", email: "ada@example.com" },
      "user-1"
    );

    expect(result).toEqual({ leadId: "lead-1", assignedAgentId: "agent-1" });
    expect(updates[0]).toMatchObject({
      investorId: "inv-1",
      status: "converted",
    });
  });

  it("carries the lead's agent and IB attribution onto an unassigned investor", async () => {
    const { tx, updates, auditInserts } = createRecordingTx([
      {
        id: "lead-1",
        assignedAgentId: "agent-1",
        ibId: "ib-1",
        createdAt: new Date("2026-07-01T12:00:00Z"),
      },
    ]);

    await linkLeadOnInvestorCreate(
      tx as unknown as TxParam,
      { id: "inv-1", email: "ada@example.com" },
      "user-1"
    );

    expect(updates[1]).toMatchObject({
      assignedAgentId: "agent-1",
      ibId: "ib-1",
    });
    expect(auditInserts[0]).toMatchObject({
      action: "lead.linked_on_signup",
      payload: { investorId: "inv-1", assignedAgentId: "agent-1" },
    });
  });

  it("keeps an existing staff assignment when a stale lead re-links", async () => {
    const { tx, updates, auditInserts } = createRecordingTx(
      [
        {
          id: "lead-1",
          assignedAgentId: "agent-1",
          ibId: "ib-1",
          createdAt: new Date("2026-07-01T12:00:00Z"),
        },
      ],
      { investorAlreadyAssigned: true }
    );

    const result = await linkLeadOnInvestorCreate(
      tx as unknown as TxParam,
      { id: "inv-1", email: "ada@example.com" },
      "user-1"
    );

    // The lead still links and converts; the investor's assignment is untouched.
    expect(result).toEqual({ leadId: "lead-1", assignedAgentId: null });
    expect(updates[0]).toMatchObject({
      investorId: "inv-1",
      status: "converted",
    });
    expect(auditInserts[0]).toMatchObject({
      action: "lead.linked_on_signup",
      payload: { investorId: "inv-1", assignedAgentId: null },
    });
  });

  it("does not touch the investor when the lead has no assigned agent", async () => {
    const { tx, updates } = createRecordingTx([
      {
        id: "lead-1",
        assignedAgentId: null,
        ibId: null,
        createdAt: new Date("2026-07-01T12:00:00Z"),
      },
    ]);

    const result = await linkLeadOnInvestorCreate(
      tx as unknown as TxParam,
      { id: "inv-1", email: "ada@example.com" },
      "user-1"
    );

    expect(result).toEqual({ leadId: "lead-1", assignedAgentId: null });
    expect(updates).toHaveLength(1);
  });

  it.each(["unqualified", "duplicate", "converted"])(
    "does not link, convert, or attribute a stale %s lead",
    async (status) => {
      const { tx, updates, auditInserts } = createRecordingTx([
        {
          id: "lead-1",
          status,
          assignedAgentId: "agent-1",
          ibId: "ib-1",
          createdAt: new Date("2026-07-01T12:00:00Z"),
        },
      ]);

      const result = await linkLeadOnInvestorCreate(
        tx as unknown as TxParam,
        { id: "inv-1", email: "ada@example.com" },
        "user-1"
      );

      expect(result).toEqual({ leadId: null, assignedAgentId: null });
      expect(updates).toHaveLength(0);
      expect(auditInserts).toHaveLength(0);
    }
  );
});

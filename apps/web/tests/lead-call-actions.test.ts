import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn()
}));

vi.mock("@/lib/leads/scope", () => ({
  leadVisibleToStaff: vi.fn(
    ({
      role,
      staffId,
      lead
    }: {
      role: "super_admin" | "ib" | "agent";
      staffId: string;
      lead: { assignedAgentId: string | null; ibId: string | null };
    }) =>
      role === "super_admin" ||
      (role === "ib" && lead.ibId === staffId) ||
      (role === "agent" && lead.assignedAgentId === staffId)
  )
}));

vi.mock("@/lib/db", () => {
  const db = {
    transaction: vi.fn()
  };

  return {
    db,
    auditEvents: {},
    leadCallAttempts: {},
    leads: {
      id: "leads.id",
      listId: "leads.listId",
      assignedAgentId: "leads.assignedAgentId",
      ibId: "leads.ibId",
      status: "leads.status",
      lastActivityAt: "leads.lastActivityAt"
    }
  };
});

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/staff";
import { leadVisibleToStaff } from "@/lib/leads/scope";
import { auditEvents, db, leadCallAttempts, leads } from "@/lib/db";
import { logCallAttempt } from "@/lib/leads/call-actions";

function staffContext() {
  return {
    user: { id: "user-1", email: "agent@example.com" },
    staff: { id: "agent-1", role: "agent" as const, ibId: "ib-1" },
    role: "agent" as const
  };
}

function lockedSelect(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const forUpdate = vi.fn().mockReturnValue(resolved);
  const limit = vi.fn().mockReturnValue({ for: forUpdate });
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from, forUpdate };
}

function configureTransaction(lead: Record<string, unknown>) {
  const select = lockedSelect([lead]);
  const attemptValues = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "attempt-1" }])
  });
  const auditValues = vi.fn().mockResolvedValue([]);
  const tx = {
    select: vi.fn().mockReturnValue(select),
    insert: vi
      .fn()
      .mockImplementationOnce(() => ({
        values: attemptValues
      }))
      .mockImplementationOnce(() => ({
        values: auditValues
      })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([])
      })
    })
  };

  vi.mocked(db.transaction).mockImplementation(
    async (callback) => callback(tx as never) as never
  );

  return { tx, select, attemptValues, auditValues };
}

describe("lead call logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireStaff).mockResolvedValue(staffContext());
  });

  it("locks the lead and commits the call, activity update, and audit together", async () => {
    const lastActivityAt = new Date("2026-08-02T00:00:00.000Z");
    const { tx, select, attemptValues } = configureTransaction({
      id: "lead-1",
      listId: "list-1",
      assignedAgentId: "agent-1",
      ibId: "ib-1",
      status: "new",
      lastActivityAt
    });

    const result = await logCallAttempt({
      leadId: "lead-1",
      outcome: "reached",
      notes: "Investor asked for a callback.",
      calledAt: "2026-08-01T00:00:00.000Z",
      followUpAt: null
    });

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(select.forUpdate).toHaveBeenCalledWith("update");
    expect(tx.insert).toHaveBeenNthCalledWith(1, leadCallAttempts);
    expect(tx.update).toHaveBeenCalledWith(leads);
    expect(tx.insert).toHaveBeenNthCalledWith(2, auditEvents);
    expect(attemptValues).toHaveBeenCalledWith({
      leadId: "lead-1",
      agentId: "agent-1",
      calledAt: new Date("2026-08-01T00:00:00.000Z"),
      outcome: "reached",
      notes: "Investor asked for a callback."
    });

    const updateBuilder = vi.mocked(tx.update).mock.results[0]?.value;
    const setValues = vi.mocked(updateBuilder.set).mock.calls[0]?.[0];
    expect(setValues.lastActivityAt).toEqual(lastActivityAt);
    expect(setValues.nextFollowUpAt).toBeNull();
    expect(setValues.status).toBe("contacted");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/leads/lead/lead-1");
  });

  it("fails closed when ownership changes before the locked write", async () => {
    const { tx, select } = configureTransaction({
      id: "lead-1",
      listId: "list-1",
      assignedAgentId: "other-agent",
      ibId: "ib-1",
      status: "contacted",
      lastActivityAt: null
    });
    vi.mocked(leadVisibleToStaff).mockReturnValue(false);

    const result = await logCallAttempt({
      leadId: "lead-1",
      outcome: "no_answer"
    });

    expect(result).toEqual({
      ok: false,
      error: "You do not have access to this lead."
    });
    expect(select.forUpdate).toHaveBeenCalledWith("update");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});

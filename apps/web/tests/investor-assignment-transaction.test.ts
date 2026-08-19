import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => ({})) }));
vi.mock("@/lib/auth/staff", () => ({ requireSuperAdmin: vi.fn() }));

const mocks = vi.hoisted(() => {
  const select = vi.fn();
  const update = vi.fn();
  const insert = vi.fn();
  const tx = { select, update, insert };
  const transaction = vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
    callback(tx)
  );
  return { select, update, insert, tx, transaction };
});

vi.mock("@/lib/db", () => ({
  db: { transaction: mocks.transaction },
  auditEvents: {},
  investors: {},
  staffProfiles: {}
}));

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { assignInvestor } from "@/lib/investors/admin-actions";

function queueSelect(rows: unknown[], lockModes: string[]) {
  mocks.select.mockImplementationOnce(() => ({
    from: () => ({
      where: () => ({
        limit: () => ({
          for: (mode: string) => {
            lockModes.push(mode);
            return Promise.resolve(rows);
          }
        })
      })
    })
  }));
}

function mockWrites() {
  const updateWhere = vi.fn(() => Promise.resolve());
  const updateSet = vi.fn((value: Record<string, unknown>) => ({ where: updateWhere, value }));
  const insertValues = vi.fn(() => Promise.resolve());
  mocks.update.mockImplementationOnce(() => ({ set: updateSet }));
  mocks.insert.mockImplementationOnce(() => ({ values: insertValues }));
  return { updateSet, updateWhere, insertValues };
}

describe("assignInvestor transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "auth-admin", email: "admin@parkwise.test" },
      staff: { id: "staff-admin", role: "super_admin", ibId: null },
      role: "super_admin"
    } as never);
  });

  it("locks the investor, validates the agent, updates attribution, and audits atomically", async () => {
    const locks: string[] = [];
    queueSelect(
      [{
        id: "inv-1",
        assignedAgentId: "agent-old",
        ibId: "ib-old",
        originalAgentId: null,
        originalIbId: null
      }],
      locks
    );
    queueSelect(
      [{
        id: "agent-new",
        role: "agent",
        ibId: "ib-new",
        deactivatedAt: null
      }],
      locks
    );
    const { updateSet, insertValues } = mockWrites();

    const result = await assignInvestor({
      investorId: "inv-1",
      agentStaffId: "agent-new"
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(locks).toEqual(["update", "share"]);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedAgentId: "agent-new",
        ibId: "ib-new",
        originalAgentId: "agent-new",
        originalIbId: "ib-new",
        updatedAt: expect.any(Date)
      })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "auth-admin",
        action: "investor.assigned",
        entityId: "inv-1",
        payload: {
          fromAgentStaffId: "agent-old",
          fromIbStaffId: "ib-old",
          toAgentStaffId: "agent-new",
          toIbStaffId: "ib-new"
        }
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/investors");
  });

  it("preserves existing original attribution during reassignment", async () => {
    const locks: string[] = [];
    queueSelect(
      [{
        id: "inv-1",
        assignedAgentId: "agent-old",
        ibId: "ib-old",
        originalAgentId: "agent-first",
        originalIbId: "ib-first"
      }],
      locks
    );
    queueSelect(
      [{
        id: "agent-new",
        role: "agent",
        ibId: "ib-new",
        deactivatedAt: null
      }],
      locks
    );
    const { updateSet } = mockWrites();

    expect(
      await assignInvestor({ investorId: "inv-1", agentStaffId: "agent-new" })
    ).toEqual({ ok: true });

    const update = updateSet.mock.calls[0][0];
    expect(update.originalAgentId).toBeUndefined();
    expect(update.originalIbId).toBeUndefined();
  });

  it("returns a soft error and writes nothing for an invalid target agent", async () => {
    const locks: string[] = [];
    queueSelect(
      [{
        id: "inv-1",
        assignedAgentId: null,
        ibId: null,
        originalAgentId: null,
        originalIbId: null
      }],
      locks
    );
    queueSelect(
      [{ id: "staff-1", role: "ib", ibId: null, deactivatedAt: null }],
      locks
    );

    const result = await assignInvestor({
      investorId: "inv-1",
      agentStaffId: "staff-1"
    });

    expect(result).toEqual({ ok: false, error: "Agent not found." });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns not found from inside the transaction when the investor is absent", async () => {
    const locks: string[] = [];
    queueSelect([], locks);

    const result = await assignInvestor({
      investorId: "missing",
      agentStaffId: null
    });

    expect(result).toEqual({ ok: false, error: "Investor not found." });
    expect(locks).toEqual(["update"]);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects unauthorized callers before opening a transaction", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValueOnce(new Error("FORBIDDEN"));

    const result = await assignInvestor({
      investorId: "inv-1",
      agentStaffId: null
    });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

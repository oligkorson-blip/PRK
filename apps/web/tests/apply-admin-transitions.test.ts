import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  requireSuperAdmin: vi.fn(),
  investorVisibleToStaff: vi.fn()
}));
vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: vi.fn(async () => ({ sent: true }))
}));
vi.mock("better-auth/crypto", () => ({
  hashPassword: vi.fn(async () => "hashed-password")
}));

const mocks = vi.hoisted(() => {
  const lockedRows: unknown[][] = [];
  const selectFor = vi.fn();
  const updateSet = vi.fn();
  const updateWhere = vi.fn();
  const auditValues = vi.fn();

  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = lockedRows.shift() ?? [];
          const chain: Record<string, unknown> = {};
          chain.orderBy = vi.fn(() => chain);
          chain.limit = vi.fn(() => chain);
          chain.for = vi.fn((mode: string) => {
            selectFor(mode);
            return Promise.resolve(rows);
          });
          return chain;
        })
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => {
        updateSet(values);
        return { where: updateWhere };
      })
    })),
    insert: vi.fn(() => ({ values: auditValues }))
  };

  return {
    lockedRows,
    selectFor,
    updateSet,
    updateWhere,
    auditValues,
    tx,
    transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx))
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: mocks.transaction
  },
  account: {},
  auditEvents: {},
  investorApplications: {
    id: "investor_applications.id",
    investorId: "investor_applications.investor_id",
    createdAt: "investor_applications.created_at",
    status: "investor_applications.status"
  },
  investors: {
    id: "investors.id",
    assignedAgentId: "investors.assigned_agent_id",
    ibId: "investors.ib_id"
  },
  inviteTokens: {},
  user: {}
}));

import { investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { markApplicationContacted, rejectApplication } from "@/lib/apply/admin-actions";

function queueLockedRows(...rows: unknown[][]) {
  mocks.lockedRows.push(...rows);
}

function mockAgent() {
  vi.mocked(requireStaff).mockResolvedValue({
    user: { id: "auth-agent", email: "agent@parkwise.test" },
    staff: { id: "staff-1", role: "agent", ibId: null },
    role: "agent"
  });
}

const investorRow = { assignedAgentId: "staff-1", ibId: null };

describe("application admin transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lockedRows.length = 0;
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.auditValues.mockResolvedValue(undefined);
    mockAgent();
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
  });

  it("marks the locked latest application contacted and audits in one transaction", async () => {
    queueLockedRows([investorRow], [{ id: "app-1", status: "submitted" }]);

    const result = await markApplicationContacted("inv-1");

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.selectFor).toHaveBeenNthCalledWith(1, "update");
    expect(mocks.selectFor).toHaveBeenNthCalledWith(2, "update");
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "contacted", updatedAt: expect.any(Date) })
    );
    expect(mocks.auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "auth-agent",
        action: "application.contacted",
        entityType: "investor",
        entityId: "inv-1",
        payload: { applicationId: "app-1" }
      })
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rechecks staff visibility against the locked investor assignment", async () => {
    queueLockedRows([{ assignedAgentId: "someone-else", ibId: "other-ib" }]);
    vi.mocked(investorVisibleToStaff).mockReturnValue(false);

    const result = await markApplicationContacted("inv-1");

    expect(result).toEqual({ ok: false, error: "You do not have access to this investor." });
    expect(mocks.selectFor).toHaveBeenCalledWith("update");
    expect(mocks.tx.update).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it("does not overwrite a terminal application state observed under lock", async () => {
    queueLockedRows([investorRow], [{ id: "app-1", status: "approved" }]);

    const result = await markApplicationContacted("inv-1");

    expect(result).toEqual({ ok: false, error: "Application is already approved." });
    expect(mocks.tx.update).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it("rolls back the contacted transition when its audit insert fails", async () => {
    queueLockedRows([investorRow], [{ id: "app-1", status: "submitted" }]);
    mocks.auditValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(markApplicationContacted("inv-1")).rejects.toThrow("audit unavailable");

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.update).toHaveBeenCalledTimes(1);
  });

  it("rejects the locked latest application and audits the trimmed ops note", async () => {
    queueLockedRows([investorRow], [{ id: "app-2", status: "contacted" }]);

    const result = await rejectApplication("inv-1", "  Unable to verify source of funds.  ");

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.selectFor).toHaveBeenCalledTimes(2);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "rejected",
        opsNote: "Unable to verify source of funds.",
        updatedAt: expect.any(Date)
      })
    );
    expect(mocks.auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "auth-agent",
        action: "application.rejected",
        entityType: "investor",
        entityId: "inv-1",
        payload: {
          applicationId: "app-2",
          opsNote: "Unable to verify source of funds."
        }
      })
    );
  });

  it("does not overwrite an approved application with rejected", async () => {
    queueLockedRows([investorRow], [{ id: "app-2", status: "approved" }]);

    const result = await rejectApplication("inv-1", "Unable to verify identity.");

    expect(result).toEqual({ ok: false, error: "Application is already approved." });
    expect(mocks.tx.update).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it("validates the rejection note before opening a transaction", async () => {
    const result = await rejectApplication("inv-1", "short");

    expect(result).toEqual({
      ok: false,
      error: "Rejection note required (at least 8 characters)."
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mocks.tx.select).not.toHaveBeenCalled();
  });

  it("rolls back rejection when its audit insert fails", async () => {
    queueLockedRows([investorRow], [{ id: "app-2", status: "submitted" }]);
    mocks.auditValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(rejectApplication("inv-1", "Unable to verify identity.")).rejects.toThrow(
      "audit unavailable"
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.update).toHaveBeenCalledTimes(1);
  });
});

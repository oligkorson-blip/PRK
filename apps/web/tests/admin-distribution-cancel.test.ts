import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/investor", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({ investorVisibleToStaff: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail: vi.fn() }));

const mocks = vi.hoisted(() => {
  const tx = { select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn() };
  return {
    tx,
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx))
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: mocks.select, insert: mocks.insert, transaction: mocks.transaction },
  assets: {},
  auditEvents: {},
  distributionApprovals: {},
  distributions: {},
  holdings: {},
  investors: {}
}));

import { requireAdmin } from "@/lib/auth/investor";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { sendTransactionalEmail } from "@/lib/email/send";
import { cancelDistribution } from "@/lib/portfolio/admin-distributions";

const selectMock = mocks.select;
const updateMock = mocks.tx.update;
const insertMock = mocks.tx.insert;

function mockDistributionRow(row: Record<string, unknown> | undefined) {
  selectMock.mockImplementationOnce(() => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({ limit: () => Promise.resolve(row ? [row] : []) })
      })
    })
  }));
}

function mockTxCancelLocks(status = "paid") {
  const investorFor = vi.fn().mockResolvedValue([{
    id: "investor-1",
    assignedAgentId: null,
    ibId: null
  }]);
  const investorWhere = vi.fn().mockReturnValue({ for: investorFor });
  const investorFrom = vi.fn().mockReturnValue({ where: investorWhere });

  const distributionFor = vi.fn().mockResolvedValue([{ status }]);
  const distributionWhere = vi.fn().mockReturnValue({ for: distributionFor });
  const distributionFrom = vi.fn().mockReturnValue({ where: distributionWhere });

  mocks.tx.select
    .mockImplementationOnce((() => ({ from: investorFrom })) as never)
    .mockImplementationOnce((() => ({ from: distributionFrom })) as never);
}

function mockUpdate(rows: { id: string }[] = [{ id: "dist-1" }]) {
  mockTxCancelLocks();
  const returningSpy = vi.fn(() => Promise.resolve(rows));
  const whereSpy = vi.fn(() => ({ returning: returningSpy }));
  const setSpy = vi.fn(() => ({ where: whereSpy }));
  updateMock.mockImplementationOnce(() => ({ set: setSpy }));
  return { setSpy, whereSpy, returningSpy };
}

function mockAuditInsert() {
  const valuesSpy = vi.fn(() => Promise.resolve());
  insertMock.mockImplementationOnce(() => ({ values: valuesSpy }));
  return valuesSpy;
}

function mockStaff(input: { staffId: string; role: "super_admin" | "agent" | "ib" }) {
  vi.mocked(requireAdmin).mockResolvedValue({
    id: `auth-${input.staffId}`,
    email: `${input.staffId}@parkwise.test`,
    staffId: input.staffId,
    role: input.role,
    user: { id: `auth-${input.staffId}`, email: `${input.staffId}@parkwise.test` },
    staff: { id: input.staffId, role: input.role, ibId: null }
  } as never);
}

describe("cancelDistribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.select.mockReset();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      staffId: "staff-1",
      role: "super_admin",
      user: { id: "user-1", email: "admin@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null }
    } as never);
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
  });

  it("cancels a paid distribution and writes the distribution.cancelled audit event", async () => {
    mockDistributionRow({
      id: "dist-1",
      status: "paid",
      amountEur: 125,
      investorId: "investor-1",
      assignedAgentId: null,
      ibId: null
    });
    const { setSpy } = mockUpdate();
    const auditValues = mockAuditInsert();

    const result = await cancelDistribution({ distributionId: "dist-1" });

    expect(result).toEqual({ ok: true });
    // Status change and audit row commit in one transaction.
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", updatedAt: expect.any(Date) })
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "distribution.cancelled",
        entityType: "distribution",
        entityId: "dist-1",
        payload: { investorId: "investor-1", previousStatus: "paid" }
      })
    );
    // Cancellation is correction-only: the investor must not be emailed.
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects a stale cancellation when another action changed the status", async () => {
    mockDistributionRow({
      id: "dist-1",
      status: "paid",
      amountEur: 125,
      investorId: "investor-1",
      assignedAgentId: null,
      ibId: null
    });
    mockUpdate([]);

    const result = await cancelDistribution({ distributionId: "dist-1" });

    expect(result).toEqual({
      ok: false,
      error: "Distribution status changed while you were reviewing it. Refresh and try again."
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns an error when the distribution does not exist", async () => {
    mockDistributionRow(undefined);

    const result = await cancelDistribution({ distributionId: "missing" });

    expect(result).toEqual({ ok: false, error: "Distribution not found." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("blocks staff whose book does not contain the investor", async () => {
    mockDistributionRow({
      id: "dist-1",
      status: "scheduled",
      amountEur: 125,
      investorId: "investor-1",
      assignedAgentId: "agent-9",
      ibId: "ib-9"
    });
    vi.mocked(investorVisibleToStaff).mockReturnValue(false);

    const result = await cancelDistribution({ distributionId: "dist-1" });

    expect(result).toEqual({
      ok: false,
      error: "You do not have access to this investor."
    });
    expect(investorVisibleToStaff).toHaveBeenCalledWith({
      role: "super_admin",
      staffId: "staff-1",
      investor: { assignedAgentId: "agent-9", ibId: "ib-9" }
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "failed"])(
    "refuses to cancel a distribution already in status %s",
    async (status) => {
      mockDistributionRow({
        id: "dist-1",
        status,
        amountEur: 125,
        investorId: "investor-1",
        assignedAgentId: null,
        ibId: null
      });

      const result = await cancelDistribution({ distributionId: "dist-1" });

      expect(result).toEqual({
        ok: false,
        error: "Only scheduled or paid distributions can be cancelled."
      });
      expect(updateMock).not.toHaveBeenCalled();
    }
  );
});

describe("cancelDistribution four-eyes gate", () => {
  const bigRow = {
    id: "dist-1",
    status: "paid",
    amountEur: 60000,
    investorId: "investor-1",
    assignedAgentId: null,
    ibId: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.select.mockReset();
    approvalLookupCount = 0;
    mockStaff({ staffId: "staff-1", role: "super_admin" });
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
  });

  /** Approval lookups use the same transaction as approval creation and auditing. */
  let approvalLookupCount = 0;
  function mockTxApprovalLookup(rows: unknown[]) {
    if (approvalLookupCount === 0) mockTxCancelLocks();
    approvalLookupCount += 1;
    mocks.tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) })
    }));
  }

  function mockApprovalInsert(approvalRows: unknown[] = [
    { id: "appr-1", approvedByStaffId: "staff-1" }
  ]) {
    const approvalReturning = vi.fn(() => Promise.resolve(approvalRows));
    const onConflictDoNothing = vi.fn(() => ({ returning: approvalReturning }));
    const approvalValues = vi.fn(() => ({ onConflictDoNothing }));
    insertMock.mockImplementationOnce(() => ({ values: approvalValues }));
    return { approvalValues, onConflictDoNothing };
  }

  it("records the first cancellation approval and its audit in one transaction", async () => {
    mockDistributionRow(bigRow);
    mockTxApprovalLookup([]);
    const { approvalValues } = mockApprovalInsert();
    const auditValues = vi.fn(() => Promise.resolve());
    insertMock.mockImplementationOnce(() => ({ values: auditValues }));

    const result = await cancelDistribution({ distributionId: "dist-1" });

    expect(result).toEqual({ ok: true, pendingSecondApproval: true });
    expect(approvalValues).toHaveBeenCalledWith({
      action: "cancel",
      subjectKey: "dist-1",
      approvedByStaffId: "staff-1"
    });
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "distribution.cancel_first_approval", entityId: "dist-1" })
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rolls back a first cancellation approval when its audit write fails", async () => {
    mockDistributionRow(bigRow);
    mockTxApprovalLookup([]);
    mockApprovalInsert();
    insertMock.mockImplementationOnce(() => ({
      values: () => Promise.reject(new Error("audit unavailable"))
    }));

    const result = await cancelDistribution({ distributionId: "dist-1" });

    expect(result).toEqual({
      ok: false,
      error: "Could not record the first approval. Please try again."
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("cancels when a second, different super admin approves, consuming the approval", async () => {
    mockStaff({ staffId: "staff-2", role: "super_admin" });
    mockDistributionRow(bigRow);
    mockTxApprovalLookup([{ id: "appr-1", approvedByStaffId: "staff-1" }]);
    const deleteWhere = vi.fn(() => Promise.resolve());
    mocks.tx.delete.mockImplementationOnce(() => ({ where: deleteWhere }));
    const { setSpy } = mockUpdate();
    const auditValues = mockAuditInsert();

    const result = await cancelDistribution({ distributionId: "dist-1" });

    expect(result).toEqual({ ok: true });
    expect(mocks.insert).not.toHaveBeenCalled(); // existing approval reused
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.tx.delete).toHaveBeenCalledTimes(1); // consumed in the same tx
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", updatedAt: expect.any(Date) })
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "distribution.cancelled",
        payload: expect.objectContaining({ firstApprovedByStaffId: "staff-1" })
      })
    );
  });

  it("rejects the same super admin attempting the second approval", async () => {
    mockDistributionRow(bigRow);
    mockTxApprovalLookup([{ id: "appr-1", approvedByStaffId: "staff-1" }]);

    const result = await cancelDistribution({ distributionId: "dist-1" });

    expect(result).toEqual({
      ok: false,
      error: "A second super admin must approve this cancellation."
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("adopts a concurrent cancellation approval winner and continues as second approver", async () => {
    mockStaff({ staffId: "staff-2", role: "super_admin" });
    mockDistributionRow(bigRow);
    mockTxApprovalLookup([]);
    mockTxApprovalLookup([{ id: "appr-1", approvedByStaffId: "staff-1" }]);
    const { onConflictDoNothing } = mockApprovalInsert([]);
    const deleteWhere = vi.fn(() => Promise.resolve());
    mocks.tx.delete.mockImplementationOnce(() => ({ where: deleteWhere }));
    const { setSpy } = mockUpdate();
    const auditValues = mockAuditInsert();

    const result = await cancelDistribution({ distributionId: "dist-1" });

    expect(result).toEqual({ ok: true });
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.tx.delete).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", updatedAt: expect.any(Date) })
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "distribution.cancelled" })
    );
  });

  it("forbids a non-super-admin above the threshold before any approval lookup", async () => {
    mockStaff({ staffId: "agent-1", role: "agent" });
    mockDistributionRow(bigRow);

    const result = await cancelDistribution({ distributionId: "dist-1" });

    expect(result).toEqual({
      ok: false,
      error: "Cancelling distributions of €50,000 or more requires two super admin approvals."
    });
    expect(selectMock).toHaveBeenCalledTimes(1); // row lookup only
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

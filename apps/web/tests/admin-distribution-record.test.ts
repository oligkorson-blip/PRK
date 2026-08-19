import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/investor", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({ investorVisibleToStaff: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail: vi.fn() }));

const mocks = vi.hoisted(() => {
  const tx = { select: vi.fn(), insert: vi.fn(), delete: vi.fn() };
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
import { recordDistribution } from "@/lib/portfolio/admin-distributions";

const selectMock = mocks.select;
const insertMock = mocks.tx.insert;

const holdingRow = {
  holding: { id: "holding-1", investorId: "inv-1", assetId: "asset-1", status: "active" },
  investor: { id: "inv-1", email: "inv@parkwise.test", assignedAgentId: null, ibId: null }
};

function mockTxRecordLocks() {
  const investorFor = vi.fn().mockResolvedValue([{
    id: "inv-1",
    assignedAgentId: null,
    ibId: null
  }]);
  const investorWhere = vi.fn().mockReturnValue({ for: investorFor });
  const investorFrom = vi.fn().mockReturnValue({ where: investorWhere });

  const holdingFor = vi.fn().mockResolvedValue([{
    id: "holding-1",
    investorId: "inv-1",
    status: "active"
  }]);
  const holdingWhere = vi.fn().mockReturnValue({ for: holdingFor });
  const holdingFrom = vi.fn().mockReturnValue({ where: holdingWhere });

  mocks.tx.select
    .mockImplementationOnce((() => ({ from: investorFrom })) as never)
    .mockImplementationOnce((() => ({ from: holdingFrom })) as never);
}

let approvalLookupCount = 0;

/** One chain per db.select call; innerJoin self-returns so the holding join works. */
function mockSelectSequence(...results: unknown[][]) {
  for (const rows of results) {
    const limit = vi.fn().mockResolvedValue(rows);
    const node: Record<string, unknown> = {};
    node.where = vi.fn().mockReturnValue({ limit });
    node.innerJoin = vi.fn().mockReturnValue(node);
    selectMock.mockImplementationOnce((() => ({ from: vi.fn().mockReturnValue(node) })) as never);
  }
}

function mockTxApprovalLookup(rows: unknown[]) {
  if (approvalLookupCount === 0) mockTxRecordLocks();
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
  return { approvalValues, approvalReturning, onConflictDoNothing };
}

/** tx.insert calls in order: distribution row (values → returning), audit row (values). */
function mockTxInserts(distributionId: string) {
  mockTxRecordLocks();
  const distributionValues = vi.fn(() => ({
    returning: () => Promise.resolve([{ id: distributionId }])
  }));
  const auditValues = vi.fn(() => Promise.resolve());
  insertMock
    .mockImplementationOnce(() => ({ values: distributionValues }))
    .mockImplementationOnce(() => ({ values: auditValues }));
  return { distributionValues, auditValues };
}

function mockTxInsertRejects(error: unknown) {
  mockTxRecordLocks();
  insertMock.mockImplementationOnce(() => ({
    values: () => ({ returning: () => Promise.reject(error) })
  }));
}

describe("recordDistribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.select.mockReset();
    approvalLookupCount = 0;
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

  it("inserts the distribution and audit rows in one transaction with a derived idempotency key", async () => {
    mockSelectSequence([holdingRow], [{ name: "Sligo Car Park" }]);
    const { distributionValues, auditValues } = mockTxInserts("dist-1");

    const result = await recordDistribution({
      holdingId: "holding-1",
      amountEur: 125,
      periodLabel: "2026-07"
    });

    expect(result).toEqual({ ok: true, id: "dist-1" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(distributionValues).toHaveBeenCalledWith(
      expect.objectContaining({
        holdingId: "holding-1",
        investorId: "inv-1",
        amountEur: 125,
        type: "income",
        status: "paid",
        idempotencyKey: "record:holding-1:income:paid:125:2026-07"
      })
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "distribution.recorded",
        entityType: "distribution",
        entityId: "dist-1"
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("derives a different key when a business field differs", async () => {
    mockSelectSequence([holdingRow], [{ name: "Sligo Car Park" }]);
    const { distributionValues } = mockTxInserts("dist-2");

    const result = await recordDistribution({
      holdingId: "holding-1",
      amountEur: 125,
      status: "scheduled",
      periodLabel: "2026-07"
    });

    expect(result).toEqual({ ok: true, id: "dist-2" });
    expect(distributionValues).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "record:holding-1:income:scheduled:125:2026-07"
      })
    );
  });

  it("treats a 23505 on the idempotency key as an already-recorded retry", async () => {
    mockSelectSequence([holdingRow], [{ id: "dist-existing" }]);
    mockTxInsertRejects(
      Object.assign(new Error("duplicate key value"), { code: "23505" })
    );

    const result = await recordDistribution({
      holdingId: "holding-1",
      amountEur: 125,
      periodLabel: "2026-07"
    });

    // Idempotent success: the original row is adopted, and the duplicate
    // audit row and investor email are skipped.
    expect(result).toEqual({ ok: true, id: "dist-existing" });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rethrows insert failures that are not unique violations", async () => {
    mockSelectSequence([holdingRow]);
    mockTxInsertRejects(new Error("connection lost"));

    await expect(
      recordDistribution({ holdingId: "holding-1", amountEur: 125, periodLabel: "2026-07" })
    ).rejects.toThrow("connection lost");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

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

describe("recordDistribution enum and paidAt validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.select.mockReset();
    mockStaff({ staffId: "staff-1", role: "super_admin" });
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
  });

  it("rejects an invalid type before touching the database", async () => {
    const result = await recordDistribution({
      holdingId: "holding-1",
      amountEur: 125,
      type: "dividend" as never
    });

    expect(result).toEqual({ ok: false, error: "Invalid distribution type." });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid status before touching the database", async () => {
    const result = await recordDistribution({
      holdingId: "holding-1",
      amountEur: 125,
      status: "pending" as never
    });

    expect(result).toEqual({ ok: false, error: "Invalid distribution status." });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("rejects a future paid date for status paid", async () => {
    mockSelectSequence([holdingRow]);

    const result = await recordDistribution({
      holdingId: "holding-1",
      amountEur: 125,
      status: "paid",
      paidAt: "2999-01-01"
    });

    expect(result).toEqual({ ok: false, error: "Paid date cannot be in the future." });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("recordDistribution four-eyes gate", () => {
  const bigInput = { holdingId: "holding-1", amountEur: 60000, periodLabel: "2026-07" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.select.mockReset();
    approvalLookupCount = 0;
    mockStaff({ staffId: "staff-1", role: "super_admin" });
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
  });

  it("posts below the threshold with a single admin, exactly as before", async () => {
    mockSelectSequence([holdingRow], [{ name: "Sligo Car Park" }]);
    mockTxInserts("dist-low");

    const result = await recordDistribution({
      holdingId: "holding-1",
      amountEur: 49_999,
      periodLabel: "2026-07"
    });

    expect(result).toEqual({ ok: true, id: "dist-low" });
    expect(mocks.insert).not.toHaveBeenCalled(); // no approval row, no first-approval audit
    expect(mocks.tx.delete).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("records the first super admin approval and its audit in one transaction", async () => {
    mockSelectSequence([holdingRow]);
    mockTxApprovalLookup([]);
    const { approvalValues } = mockApprovalInsert();
    const auditValues = vi.fn(() => Promise.resolve());
    insertMock.mockImplementationOnce(() => ({ values: auditValues }));

    const result = await recordDistribution(bigInput);

    expect(result).toEqual({ ok: true, pendingSecondApproval: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(approvalValues).toHaveBeenCalledWith({
      action: "record",
      subjectKey: "record:holding-1:income:paid:60000:2026-07",
      approvedByStaffId: "staff-1"
    });
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "distribution.record_first_approval" })
    );
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rolls back a first posting approval when its audit write fails", async () => {
    mockSelectSequence([holdingRow]);
    mockTxApprovalLookup([]);
    mockApprovalInsert();
    insertMock.mockImplementationOnce(() => ({
      values: () => Promise.reject(new Error("audit unavailable"))
    }));

    const result = await recordDistribution(bigInput);

    expect(result).toEqual({
      ok: false,
      error: "Could not record the first approval. Please try again."
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("posts when a second, different super admin approves, consuming the approval", async () => {
    mockStaff({ staffId: "staff-2", role: "super_admin" });
    mockSelectSequence([holdingRow], [{ name: "Sligo Car Park" }]);
    mockTxApprovalLookup([{ id: "appr-1", approvedByStaffId: "staff-1" }]);
    const { auditValues } = mockTxInserts("dist-big");
    const deleteWhere = vi.fn(() => Promise.resolve());
    mocks.tx.delete.mockImplementationOnce(() => ({ where: deleteWhere }));

    const result = await recordDistribution(bigInput);

    expect(result).toEqual({ ok: true, id: "dist-big" });
    expect(mocks.insert).not.toHaveBeenCalled(); // existing approval reused
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.tx.delete).toHaveBeenCalledTimes(1); // consumed in the same tx
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "distribution.recorded",
        payload: expect.objectContaining({ firstApprovedByStaffId: "staff-1" })
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects the same super admin attempting the second approval", async () => {
    mockSelectSequence([holdingRow]);
    mockTxApprovalLookup([{ id: "appr-1", approvedByStaffId: "staff-1" }]);

    const result = await recordDistribution(bigInput);

    expect(result).toEqual({
      ok: false,
      error: "A second super admin must approve this distribution."
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("adopts a concurrent posting approval winner and continues as second approver", async () => {
    mockStaff({ staffId: "staff-2", role: "super_admin" });
    mockSelectSequence([holdingRow], [{ name: "Sligo Car Park" }]);
    mockTxApprovalLookup([]);
    mockTxApprovalLookup([{ id: "appr-1", approvedByStaffId: "staff-1" }]);
    const { onConflictDoNothing } = mockApprovalInsert([]);
    mockTxInserts("dist-raced");
    const deleteWhere = vi.fn(() => Promise.resolve());
    mocks.tx.delete.mockImplementationOnce(() => ({ where: deleteWhere }));

    const result = await recordDistribution(bigInput);

    expect(result).toEqual({ ok: true, id: "dist-raced" });
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.tx.delete).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("forbids a non-super-admin above the threshold before any approval lookup", async () => {
    mockStaff({ staffId: "agent-1", role: "agent" });
    mockSelectSequence([holdingRow]);

    const result = await recordDistribution(bigInput);

    expect(result).toEqual({
      ok: false,
      error: "Distributions of €50,000 or more require two super admin approvals."
    });
    expect(selectMock).toHaveBeenCalledTimes(1); // holding lookup only
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

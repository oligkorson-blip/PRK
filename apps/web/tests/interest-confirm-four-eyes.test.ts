import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({
  ensureInvestor: vi.fn(),
  requireAdmin: vi.fn()
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
  requireSessionUser: vi.fn()
}));
vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue({ sent: true })
}));

const txReturning = vi.fn();
const txWhere = vi.fn(() => ({ returning: txReturning }));
const txSet = vi.fn(() => ({ where: txWhere }));
const txApprovalReturning = vi.fn();
const txOnConflictDoNothing = vi.fn(() => ({ returning: txApprovalReturning }));
const txValues = vi.fn(() => ({ onConflictDoNothing: txOnConflictDoNothing }));
const txDeleteWhere = vi.fn();
const txSelect = vi.fn();
const tx = {
  update: vi.fn(() => ({ set: txSet })),
  insert: vi.fn(() => ({ values: txValues })),
  delete: vi.fn(() => ({ where: txDeleteWhere })),
  select: txSelect
};

const dbInsertValues = vi.fn();
const dbInsertReturning = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(() => ({ values: dbInsertValues })),
    delete: vi.fn(),
    transaction: vi.fn(async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx))
  },
  assets: { id: "assets.id", status: "assets.status", advisoryCapacityEur: "assets.advisoryCapacityEur" },
  auditEvents: { table: "auditEvents" },
  holdings: {
    table: "holdings",
    assetId: "holdings.assetId",
    amountEur: "holdings.amountEur",
    status: "holdings.status"
  },
  interestConfirmationApprovals: {
    table: "interestConfirmationApprovals",
    id: "interestConfirmationApprovals.id",
    interestId: "interestConfirmationApprovals.interestId",
    approvedByStaffId: "interestConfirmationApprovals.approvedByStaffId"
  },
  interests: { table: "interests", id: "interests.id", status: "interests.status" },
  investors: { table: "investors" },
  kycChecks: {
    table: "kycChecks",
    id: "kycChecks.id",
    investorId: "kycChecks.investorId",
    result: "kycChecks.result",
    reviewedAt: "kycChecks.reviewedAt"
  }
}));

import { requireAdmin } from "@/lib/auth/investor";
import { db, holdings, interestConfirmationApprovals } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/send";
import { confirmInterest } from "@/lib/interests/admin-actions";
import { fourEyesThresholdEur } from "@/lib/interests/four-eyes";

function mockStaff(input: { role: "super_admin" | "agent" | "ib"; staffId: string }) {
  vi.mocked(requireAdmin).mockResolvedValue({
    id: `auth-${input.staffId}`,
    email: `${input.staffId}@parkwise.test`,
    staffId: input.staffId,
    role: input.role,
    user: { id: `auth-${input.staffId}`, email: `${input.staffId}@parkwise.test` },
    staff: { id: input.staffId, role: input.role, ibId: null }
  });
}

function contextRow(input: {
  kycStatus: string;
  amountEur?: number;
  status?: string;
  assignedAgentId?: string | null;
  ibId?: string | null;
}) {
  return {
    interest: {
      id: "int-1",
      investorId: "inv-1",
      assetId: "asset-1",
      amountEur: input.amountEur ?? 10000,
      optionId: null,
      note: null,
      status: input.status ?? "pending",
      adminNote: null
    },
    asset: {
      id: "asset-1",
      slug: "sligo-1",
      name: "Sligo Car Park",
      targetYieldPct: "6.50",
      investmentOptions: []
    },
    investor: {
      id: "inv-1",
      email: "inv@parkwise.test",
      kycStatus: input.kycStatus,
      assignedAgentId: input.assignedAgentId ?? null,
      ibId: input.ibId ?? null
    }
  };
}

/** One chain per db.select call: context join, screening lookup, approval lookup(s). */
function mockSelectSequence(...results: unknown[][]) {
  const select = vi.mocked(db.select);
  for (const rows of results) {
    const limit = vi.fn().mockResolvedValue(rows);
    const node: Record<string, unknown> = {};
    // where supports both the plain context/approval lookups (→ limit) and the
    // ordered latest-screening lookup (→ orderBy → limit).
    node.where = vi.fn().mockReturnValue({ limit, orderBy: vi.fn().mockReturnValue({ limit }) });
    node.innerJoin = vi.fn().mockReturnValue(node);
    select.mockImplementationOnce((() => ({ from: vi.fn().mockReturnValue(node) })) as never);
  }
  select.mockImplementation((() => {
    throw new Error("unexpected db.select call");
  }) as never);
}

const CLEAR = [{ result: "clear" }];
let approvalLookupCount = 0;

function mockTxApprovalLookup(rows: unknown[]) {
  // The first approval transaction now locks the investor and interest and
  // rechecks AML before reading or writing the approval row. A race re-read
  // is the second approval lookup in that same transaction.
  if (approvalLookupCount === 0) {
    const investorFor = vi.fn().mockResolvedValue([{
      id: "inv-1",
      assignedAgentId: null,
      ibId: null,
      accountStatus: "active",
      kycStatus: "approved"
    }]);
    const investorWhere = vi.fn().mockReturnValue({ for: investorFor });
    const investorFrom = vi.fn().mockReturnValue({ where: investorWhere });

    const interestFor = vi.fn().mockResolvedValue([{ status: "pending" }]);
    const interestWhere = vi.fn().mockReturnValue({ for: interestFor });
    const interestFrom = vi.fn().mockReturnValue({ where: interestWhere });

    const screeningLimit = vi.fn().mockResolvedValue(CLEAR);
    const screeningOrderBy = vi.fn().mockReturnValue({ limit: screeningLimit });
    const screeningWhere = vi.fn().mockReturnValue({ orderBy: screeningOrderBy });
    const screeningFrom = vi.fn().mockReturnValue({ where: screeningWhere });

    txSelect
      .mockImplementationOnce((() => ({ from: investorFrom })) as never)
      .mockImplementationOnce((() => ({ from: interestFrom })) as never)
      .mockImplementationOnce((() => ({ from: screeningFrom })) as never);
  }
  approvalLookupCount += 1;

  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  txSelect.mockImplementationOnce((() => ({ from })) as never);
}

/**
 * The in-transaction re-checks, in call order: investor lock, asset re-read
 * (where → limit → for("update")), committed-holdings sum (where, awaited),
 * latest-screening re-check (where → orderBy → limit). Defaults are the happy path.
 */
function mockTxSelects(input?: {
  assetRows?: unknown[];
  committedRows?: unknown[];
  screeningRows?: unknown[];
}) {
  const investorFor = vi.fn().mockResolvedValue([{
    id: "inv-1",
    assignedAgentId: null,
    ibId: null,
    accountStatus: "active",
    kycStatus: "approved"
  }]);
  const investorWhere = vi.fn().mockReturnValue({ for: investorFor });
  const investorFrom = vi.fn().mockReturnValue({ where: investorWhere });

  const forAsset = vi
    .fn()
    .mockResolvedValue(input?.assetRows ?? [{ status: "published", advisoryCapacityEur: null }]);
  const limitAsset = vi.fn().mockReturnValue({ for: forAsset });
  const whereAsset = vi.fn().mockReturnValue({ limit: limitAsset });
  const fromAsset = vi.fn().mockReturnValue({ where: whereAsset });

  const whereCommitted = vi.fn().mockResolvedValue(input?.committedRows ?? [{ total: 0 }]);
  const fromCommitted = vi.fn().mockReturnValue({ where: whereCommitted });

  const limitScreening = vi.fn().mockResolvedValue(input?.screeningRows ?? CLEAR);
  const orderByScreening = vi.fn().mockReturnValue({ limit: limitScreening });
  const whereScreening = vi.fn().mockReturnValue({ orderBy: orderByScreening });
  const fromScreening = vi.fn().mockReturnValue({ where: whereScreening });

  txSelect
    .mockImplementationOnce((() => ({ from: investorFrom })) as never)
    .mockImplementationOnce((() => ({ from: fromAsset })) as never)
    .mockImplementationOnce((() => ({ from: fromCommitted })) as never)
    .mockImplementationOnce((() => ({ from: fromScreening })) as never);
}

describe("confirmInterest four-eyes gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.select).mockReset();
    txSelect.mockReset(); // drop unconsumed once-implementations from prior tests
    approvalLookupCount = 0;
    txReturning.mockResolvedValue([{ id: "int-1" }]);
    txValues.mockImplementation(() => ({ onConflictDoNothing: txOnConflictDoNothing }));
    txOnConflictDoNothing.mockImplementation(() => ({ returning: txApprovalReturning }));
    txApprovalReturning.mockResolvedValue([{ id: "appr-1", approvedByStaffId: "s1" }]);
    txDeleteWhere.mockResolvedValue(undefined);
    dbInsertValues.mockReturnValue({ returning: dbInsertReturning });
    dbInsertReturning.mockResolvedValue([{ id: "appr-1", approvedByStaffId: "s1" }]);
  });

  it("confirms below the threshold with a single click, exactly as before", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelectSequence([contextRow({ kycStatus: "approved", amountEur: 10000 })], CLEAR);
    mockTxSelects();

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({ ok: true });
    expect(db.select).toHaveBeenCalledTimes(2); // context + screening only
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled(); // no approval row, no first-approval audit
    expect(tx.delete).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("records the first super admin approval and its audit in one transaction", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelectSequence(
      [contextRow({ kycStatus: "approved", amountEur: 100000 })],
      CLEAR
    );
    mockTxApprovalLookup([]);

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({ ok: true, pendingSecondApproval: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(txValues).toHaveBeenNthCalledWith(1, {
      interestId: "int-1",
      approvedByStaffId: "s1"
    });
    expect(txValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: "interest.confirm_first_approval", entityId: "int-1" })
    );
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rolls back the first approval when its audit write fails", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelectSequence(
      [contextRow({ kycStatus: "approved", amountEur: 100000 })],
      CLEAR
    );
    mockTxApprovalLookup([]);
    txValues
      .mockImplementationOnce(() => ({ onConflictDoNothing: txOnConflictDoNothing }))
      .mockRejectedValueOnce(new Error("audit unavailable"));

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "Could not record the first approval. Please try again."
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("confirms when a second, different super admin approves, consuming the approval", async () => {
    mockStaff({ role: "super_admin", staffId: "s2" });
    mockSelectSequence(
      [contextRow({ kycStatus: "approved", amountEur: 100000 })],
      CLEAR
    );
    mockTxApprovalLookup([{ id: "appr-1", approvedByStaffId: "s1" }]);
    mockTxSelects();

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({ ok: true });
    expect(db.insert).not.toHaveBeenCalled(); // existing approval reused, no extra audit
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(tx.insert).toHaveBeenNthCalledWith(1, holdings);
    expect(tx.delete).toHaveBeenCalledWith(interestConfirmationApprovals); // consumed in the same tx
    expect(txValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "interest.confirmed",
        entityId: "int-1",
        payload: expect.objectContaining({ firstApprovedByStaffId: "s1" })
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects the same super admin attempting the second approval", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelectSequence(
      [contextRow({ kycStatus: "approved", amountEur: 100000 })],
      CLEAR
    );
    mockTxApprovalLookup([{ id: "appr-1", approvedByStaffId: "s1" }]);

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "A second super admin must approve this confirmation."
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("forbids a non-super-admin above the threshold before any approval lookup", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    mockSelectSequence(
      [contextRow({ kycStatus: "approved", amountEur: 100000, assignedAgentId: "a1" })],
      CLEAR
    );

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "Confirmations of €50,000 or more require two super admin approvals."
    });
    expect(db.select).toHaveBeenCalledTimes(2); // context + screening only
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("ignores a stale approval when the interest is no longer pending", async () => {
    mockStaff({ role: "super_admin", staffId: "s2" });
    mockSelectSequence(
      [contextRow({ kycStatus: "approved", amountEur: 100000, status: "withdrawn" })],
      CLEAR
    );

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "This interest is already withdrawn and can no longer be confirmed."
    });
    expect(db.select).toHaveBeenCalledTimes(2); // approval row never even read
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("adopts the winner of a concurrent first-approval insert", async () => {
    mockStaff({ role: "super_admin", staffId: "s2" });
    mockSelectSequence(
      [contextRow({ kycStatus: "approved", amountEur: 100000 })],
      CLEAR
    );
    mockTxApprovalLookup([]);
    mockTxApprovalLookup([{ id: "appr-1", approvedByStaffId: "s1" }]);
    txApprovalReturning.mockResolvedValueOnce([]);
    mockTxSelects();

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({ ok: true });
    expect(txOnConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(tx.delete).toHaveBeenCalledWith(interestConfirmationApprovals);
  });
});

describe("fourEyesThresholdEur", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 50000 when unset or invalid", () => {
    delete process.env.FOUR_EYES_THRESHOLD_EUR;
    expect(fourEyesThresholdEur()).toBe(50000);
    vi.stubEnv("FOUR_EYES_THRESHOLD_EUR", "abc");
    expect(fourEyesThresholdEur()).toBe(50000);
    vi.stubEnv("FOUR_EYES_THRESHOLD_EUR", "0");
    expect(fourEyesThresholdEur()).toBe(50000);
  });

  it("reads a positive integer euro threshold", () => {
    vi.stubEnv("FOUR_EYES_THRESHOLD_EUR", "75000");
    expect(fourEyesThresholdEur()).toBe(75000);
  });
});

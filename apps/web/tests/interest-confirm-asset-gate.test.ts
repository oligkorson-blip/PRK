import { beforeEach, describe, expect, it, vi } from "vitest";

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
const txValues = vi.fn();
const txSelect = vi.fn();
const tx = {
  update: vi.fn(() => ({ set: txSet })),
  insert: vi.fn(() => ({ values: txValues })),
  select: txSelect
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
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
import { db, holdings } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/send";
import { confirmInterest } from "@/lib/interests/admin-actions";

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

function contextRow() {
  return {
    interest: {
      id: "int-1",
      investorId: "inv-1",
      assetId: "asset-1",
      amountEur: 10000,
      optionId: null,
      note: null,
      status: "pending",
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
      kycStatus: "approved",
      assignedAgentId: null,
      ibId: null
    }
  };
}

/** First select = interest context join, second = latest-screening pre-check (clear). */
function mockSelects() {
  const limitContext = vi.fn().mockResolvedValue([contextRow()]);
  const whereContext = vi.fn().mockReturnValue({ limit: limitContext });
  const innerJoinInvestors = vi.fn().mockReturnValue({ where: whereContext });
  const innerJoinAssets = vi.fn().mockReturnValue({ innerJoin: innerJoinInvestors });
  const fromContext = vi.fn().mockReturnValue({ innerJoin: innerJoinAssets });

  const limitScreening = vi.fn().mockResolvedValue([{ result: "clear" }]);
  const orderByScreening = vi.fn().mockReturnValue({ limit: limitScreening });
  const whereScreening = vi.fn().mockReturnValue({ orderBy: orderByScreening });
  const fromScreening = vi.fn().mockReturnValue({ where: whereScreening });

  vi.mocked(db.select)
    .mockImplementationOnce((() => ({ from: fromContext })) as never)
    .mockImplementation((() => ({ from: fromScreening })) as never);
}

/**
 * The in-transaction re-checks, in call order: investor lock, asset re-read
 * (where → limit → for("update")), committed-holdings sum (where, awaited),
 * latest-screening re-check (where → orderBy → limit).
 */
function mockTxSelects(input: {
  assetRows: unknown[];
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

  const forAsset = vi.fn().mockResolvedValue(input.assetRows);
  const limitAsset = vi.fn().mockReturnValue({ for: forAsset });
  const whereAsset = vi.fn().mockReturnValue({ limit: limitAsset });
  const fromAsset = vi.fn().mockReturnValue({ where: whereAsset });

  const whereCommitted = vi.fn().mockResolvedValue(input.committedRows ?? [{ total: 0 }]);
  const fromCommitted = vi.fn().mockReturnValue({ where: whereCommitted });

  const limitScreening = vi.fn().mockResolvedValue(input.screeningRows ?? [{ result: "clear" }]);
  const orderByScreening = vi.fn().mockReturnValue({ limit: limitScreening });
  const whereScreening = vi.fn().mockReturnValue({ orderBy: orderByScreening });
  const fromScreening = vi.fn().mockReturnValue({ where: whereScreening });

  txSelect
    .mockImplementationOnce((() => ({ from: investorFrom })) as never)
    .mockImplementationOnce((() => ({ from: fromAsset })) as never)
    .mockImplementationOnce((() => ({ from: fromCommitted })) as never)
    .mockImplementationOnce((() => ({ from: fromScreening })) as never);
}

describe("confirmInterest asset open/capacity gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txSelect.mockReset(); // drop unconsumed once-implementations from prior tests
    txReturning.mockResolvedValue([{ id: "int-1" }]);
    txValues.mockResolvedValue(undefined);
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelects();
  });

  it("blocks when the asset was closed after the interest was expressed", async () => {
    mockTxSelects({ assetRows: [{ status: "closed", advisoryCapacityEur: null }] });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "This asset is no longer open for investment, so this interest can no longer be confirmed."
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).not.toHaveBeenCalled(); // interest never claimed
    expect(tx.insert).not.toHaveBeenCalled(); // no holding, no audit
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("blocks when confirming would push committed past the stated capacity", async () => {
    // 20,000 already committed against a 25,000 capacity — a 10,000 ticket
    // would take the asset to 30,000.
    mockTxSelects({
      assetRows: [{ status: "published", advisoryCapacityEur: 25000 }],
      committedRows: [{ total: 20000 }]
    });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "Confirming this interest would exceed the asset's stated capacity."
    });
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("confirms when the ticket exactly fills the remaining capacity", async () => {
    mockTxSelects({
      assetRows: [{ status: "published", advisoryCapacityEur: 30000 }],
      committedRows: [{ total: 20000 }]
    });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({ ok: true });
    expect(tx.insert).toHaveBeenNthCalledWith(1, holdings);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("confirms with no stated capacity regardless of committed volume", async () => {
    mockTxSelects({
      assetRows: [{ status: "published", advisoryCapacityEur: null }],
      committedRows: [{ total: 999999 }]
    });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({ ok: true });
  });
});

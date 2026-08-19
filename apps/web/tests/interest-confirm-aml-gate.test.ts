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
    insert: vi.fn(),
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

function contextRow(input: {
  kycStatus: string;
  assignedAgentId?: string | null;
  ibId?: string | null;
}) {
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
      kycStatus: input.kycStatus,
      assignedAgentId: input.assignedAgentId ?? null,
      ibId: input.ibId ?? null
    }
  };
}

/**
 * First select = interest context join, second = latest-screening lookup
 * (latestScreeningResult: where → orderBy → limit). `latestRows` is what the
 * ordered latest-first query returns; only the first row matters to the gate.
 */
function mockSelects(input: { context: unknown[]; latestRows: unknown[] }) {
  const limitContext = vi.fn().mockResolvedValue(input.context);
  const whereContext = vi.fn().mockReturnValue({ limit: limitContext });
  const innerJoinInvestors = vi.fn().mockReturnValue({ where: whereContext });
  const innerJoinAssets = vi.fn().mockReturnValue({ innerJoin: innerJoinInvestors });
  const fromContext = vi.fn().mockReturnValue({ innerJoin: innerJoinAssets });

  const limitScreening = vi.fn().mockResolvedValue(input.latestRows);
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
  assetRows?: unknown[];
  committedRows?: unknown[];
  screeningRows?: unknown[];
}) {
  const investorFor = vi.fn().mockResolvedValue([{
    id: "inv-1",
    assignedAgentId: "a1",
    ibId: null,
    accountStatus: "active",
    kycStatus: "approved"
  }]);
  const investorWhere = vi.fn().mockReturnValue({ for: investorFor });
  const investorFrom = vi.fn().mockReturnValue({ where: investorWhere });

  const forAsset = vi.fn().mockResolvedValue(input.assetRows ?? [{ status: "published", advisoryCapacityEur: null }]);
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

describe("confirmInterest AML gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txSelect.mockReset(); // drop unconsumed once-implementations from prior tests
    txReturning.mockResolvedValue([{ id: "int-1" }]);
    txValues.mockResolvedValue(undefined);
  });

  it("blocks an approved-but-unscreened investor", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelects({ context: [contextRow({ kycStatus: "approved" })], latestRows: [] });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "AML screening not clear. Record a clear sanctions/PEP screening before confirming."
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("confirms an approved investor whose latest screening is clear", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelects({
      context: [contextRow({ kycStatus: "approved" })],
      latestRows: [{ result: "clear" }]
    });
    mockTxSelects({});

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenNthCalledWith(1, holdings);
    expect(txValues).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "interest.confirmed", entityId: "int-1" })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("blocks when a clear screening was later superseded by a review flag", async () => {
    // The historical clear must not carry the confirm: the latest screening is "review".
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelects({
      context: [contextRow({ kycStatus: "approved" })],
      latestRows: [{ result: "review" }]
    });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "AML screening not clear. Record a clear sanctions/PEP screening before confirming."
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("blocks when the latest screening is rejected", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelects({
      context: [contextRow({ kycStatus: "approved" })],
      latestRows: [{ result: "rejected" }]
    });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "AML screening not clear. Record a clear sanctions/PEP screening before confirming."
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("still blocks when KYC is not approved, before the screening lookup", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelects({ context: [contextRow({ kycStatus: "submitted" })], latestRows: [{ result: "clear" }] });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "KYC not approved. Investor must finish KYC before confirmation."
    });
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("denies an agent confirming an interest outside their book", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    mockSelects({
      context: [contextRow({ kycStatus: "approved", assignedAgentId: "a2" })],
      latestRows: [{ result: "clear" }]
    });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "You do not have access to this investor's interest."
    });
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("lets a scoped agent confirm with KYC approved and a latest-clear screening", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    mockSelects({
      context: [contextRow({ kycStatus: "approved", assignedAgentId: "a1" })],
      latestRows: [{ result: "clear" }]
    });
    mockTxSelects({});

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("blocks a scoped agent when the investor has no screening at all", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    mockSelects({
      context: [contextRow({ kycStatus: "approved", assignedAgentId: "a1" })],
      latestRows: []
    });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "AML screening not clear. Record a clear sanctions/PEP screening before confirming."
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("blocks inside the transaction when a screening flips to review after the pre-check (TOCTOU)", async () => {
    // Pre-check passes (latest clear), but by claim time the latest screening
    // is "review" — the in-transaction re-check must stop the confirmation.
    mockStaff({ role: "super_admin", staffId: "s1" });
    mockSelects({
      context: [contextRow({ kycStatus: "approved" })],
      latestRows: [{ result: "clear" }]
    });
    mockTxSelects({ screeningRows: [{ result: "review" }] });

    const result = await confirmInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "AML screening not clear. Record a clear sanctions/PEP screening before confirming."
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).not.toHaveBeenCalled(); // interest never claimed
    expect(tx.insert).not.toHaveBeenCalled(); // no holding, no audit
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

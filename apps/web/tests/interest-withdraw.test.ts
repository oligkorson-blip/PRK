import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/investor", () => ({ ensureInvestor: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail: vi.fn() }));

const mocks = vi.hoisted(() => {
  const update = vi.fn();
  const insert = vi.fn();
  const tx = { update, insert };

  return {
    select: vi.fn(),
    update,
    insert,
    transaction: vi.fn(async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx))
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
  assets: {},
  auditEvents: {},
  interests: {},
  investors: {}
}));

import { ensureInvestor } from "@/lib/auth/investor";
import { withdrawInterest } from "@/lib/interests/actions";

function mockInvestor(accountStatus: string) {
  vi.mocked(ensureInvestor).mockResolvedValue({
    id: "inv-1",
    authUserId: "auth-1",
    email: "inv@parkwise.test",
    onboardingStatus: "completed",
    termsAcceptedAt: new Date("2026-01-01"),
    riskAcceptedAt: new Date("2026-01-01"),
    accountStatus
  } as never);
}

function mockInterestLookup(row: Record<string, unknown> | undefined) {
  mocks.select.mockImplementationOnce(() => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(row ? [row] : []) })
    })
  }));
}

function mockWithdrawUpdate() {
  const returning = vi.fn(() => Promise.resolve([{ id: "int-1" }]));
  const where = vi.fn(() => ({ returning }));
  const setSpy = vi.fn(() => ({ where }));
  mocks.update.mockImplementationOnce(() => ({ set: setSpy }));
  return setSpy;
}

function mockAuditInsert() {
  const valuesSpy = vi.fn(() => Promise.resolve());
  mocks.insert.mockImplementationOnce(() => ({ values: valuesSpy }));
  return valuesSpy;
}

describe("withdrawInterest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a suspended investor before any database work", async () => {
    mockInvestor("suspended");

    const result = await withdrawInterest({ interestId: "int-1" });

    expect(result).toEqual({
      ok: false,
      error: "Your account isn’t ready for investment actions yet. Talk to the team."
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("withdraws a pending interest for an active investor", async () => {
    mockInvestor("active");
    mockInterestLookup({ id: "int-1", investorId: "inv-1", status: "pending" });
    const setSpy = mockWithdrawUpdate();
    const auditValues = mockAuditInsert();

    const result = await withdrawInterest({ interestId: "int-1" });

    expect(result).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "withdrawn", updatedAt: expect.any(Date) })
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "interest.withdrawn", entityId: "int-1" })
    );
  });
});
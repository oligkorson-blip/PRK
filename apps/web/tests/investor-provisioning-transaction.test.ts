import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  dbInsert: vi.fn(),
  transaction: vi.fn(),
  txInsert: vi.fn(),
  txSelect: vi.fn(),
  txSelectLimit: vi.fn(),
  txUpdate: vi.fn(),
  txUpdateSet: vi.fn(),
  txUpdateWhere: vi.fn(),
  txUpdateReturning: vi.fn(),
  investorValues: vi.fn(),
  investorReturning: vi.fn(),
  auditValues: vi.fn()
}));

vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock("@/lib/auth/session", () => ({ requireSessionUser: vi.fn() }));
vi.mock("@/lib/db/errors", () => ({ isUniqueViolation: vi.fn() }));
vi.mock("@/lib/leads/link", () => ({ linkLeadOnInvestorCreate: vi.fn() }));
vi.mock("@/lib/db", () => {
  const auditEvents = { table: "audit_events" };
  const investors = {
    table: "investors",
    id: "investors.id",
    authUserId: "investors.auth_user_id"
  };
  return {
    auditEvents,
    investors,
    leads: { id: "leads.id", investorId: "leads.investor_id" },
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: mocks.selectLimit }))
        }))
      })),
      insert: mocks.dbInsert,
      transaction: mocks.transaction
    }
  };
});

import { requireSessionUser } from "@/lib/auth/session";
import { ensureInvestor } from "@/lib/auth/investor";
import { auditEvents, investors } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { linkLeadOnInvestorCreate } from "@/lib/leads/link";

const user = { id: "auth-1", email: "investor@example.com" };
const created = {
  id: "inv-1",
  authUserId: user.id,
  email: user.email,
  fullName: "",
  assignedAgentId: null
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSessionUser).mockResolvedValue(user);
  vi.mocked(isUniqueViolation).mockReturnValue(false);
  vi.mocked(linkLeadOnInvestorCreate).mockResolvedValue({
    leadId: null,
    assignedAgentId: null
  });
  mocks.selectLimit.mockResolvedValue([]);
  mocks.investorReturning.mockResolvedValue([created]);
  mocks.investorValues.mockImplementation(() => ({ returning: mocks.investorReturning }));
  mocks.auditValues.mockResolvedValue(undefined);
  mocks.txSelectLimit.mockResolvedValue([]);
  mocks.txSelect.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({ for: mocks.txSelectLimit }))
      }))
    }))
  }));
  mocks.txUpdateReturning.mockResolvedValue([created]);
  mocks.txUpdateWhere.mockImplementation(() => ({
    returning: mocks.txUpdateReturning
  }));
  mocks.txUpdateSet.mockImplementation(() => ({
    where: mocks.txUpdateWhere
  }));
  mocks.txUpdate.mockImplementation(() => ({
    set: mocks.txUpdateSet
  }));
  mocks.txInsert.mockImplementation((table: unknown) =>
    table === investors
      ? { values: mocks.investorValues }
      : { values: mocks.auditValues }
  );
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      insert: mocks.txInsert,
      select: mocks.txSelect,
      update: mocks.txUpdate
    })
  );
});

describe("first-time investor provisioning", () => {
  it("commits the investor row and creation audit through one transaction", async () => {
    const result = await ensureInvestor();

    expect(result).toEqual(created);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.dbInsert).not.toHaveBeenCalled();
    expect(mocks.txInsert).toHaveBeenNthCalledWith(1, investors);
    expect(mocks.txInsert).toHaveBeenNthCalledWith(2, auditEvents);
    expect(mocks.investorValues).toHaveBeenCalledWith({
      authUserId: user.id,
      email: user.email,
      fullName: ""
    });
    expect(mocks.auditValues).toHaveBeenCalledWith({
      actorUserId: user.id,
      action: "investor.created",
      entityType: "investor",
      entityId: created.id,
      payload: { email: user.email }
    });
    expect(linkLeadOnInvestorCreate).toHaveBeenCalledWith(
      expect.anything(),
      created,
      user.id
    );
  });

  it("claims a public application investor by email before creating a duplicate", async () => {
    const unclaimed = {
      ...created,
      id: "inv-public",
      authUserId: null
    };
    const claimed = { ...unclaimed, authUserId: user.id };

    mocks.selectLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([unclaimed]);
    mocks.txSelectLimit.mockResolvedValue([unclaimed]);
    mocks.txUpdateReturning.mockResolvedValue([claimed]);

    const result = await ensureInvestor();

    expect(result).toEqual(claimed);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.investorValues).not.toHaveBeenCalled();
    expect(mocks.txUpdate).toHaveBeenCalledWith(investors);
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: user.id,
        updatedAt: expect.any(Date)
      })
    );
    expect(mocks.auditValues).toHaveBeenCalledWith({
      actorUserId: user.id,
      action: "investor.claimed_on_signin",
      entityType: "investor",
      entityId: claimed.id,
      payload: { email: user.email }
    });
    expect(linkLeadOnInvestorCreate).toHaveBeenCalledWith(
      expect.anything(),
      claimed,
      user.id
    );
  });

  it("does not continue to lead linking when the creation audit fails", async () => {
    mocks.auditValues.mockRejectedValue(new Error("audit unavailable"));

    await expect(ensureInvestor()).rejects.toThrow("audit unavailable");

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(linkLeadOnInvestorCreate).not.toHaveBeenCalled();
  });

  it("does not audit or link an empty investor insert result", async () => {
    mocks.investorReturning.mockResolvedValue([]);

    await expect(ensureInvestor()).rejects.toThrow("Investor insert returned no row.");

    expect(mocks.auditValues).not.toHaveBeenCalled();
    expect(linkLeadOnInvestorCreate).not.toHaveBeenCalled();
  });

  it("preserves concurrent-signup recovery after a transactional unique conflict", async () => {
    const conflict = new Error("duplicate key");
    const winner = { ...created, id: "inv-winner" };
    mocks.selectLimit
      .mockResolvedValueOnce([]) // authUserId lookup
      .mockResolvedValueOnce([]) // no unclaimed public applicant
      .mockResolvedValueOnce([winner]); // winner lookup after unique conflict
    mocks.transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({})
      );
    vi.mocked(isUniqueViolation).mockImplementation((error) => error === conflict);

    const result = await ensureInvestor();

    expect(result).toEqual(winner);
    expect(linkLeadOnInvestorCreate).toHaveBeenCalledWith(
      expect.anything(),
      winner,
      user.id
    );
  });
});

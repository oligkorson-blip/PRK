import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({
  requireSuperAdmin: vi.fn(),
  investorVisibleToStaff: vi.fn()
}));

const txSelectQueue: unknown[][] = [];
const selectFor = vi.fn();
const txDeleteWhere = vi.fn();
const txUpdateWhere = vi.fn();
const txInsertValues = vi.fn();
const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn((mode: string) => {
          selectFor(mode);
          return Promise.resolve(txSelectQueue.shift() ?? []);
        })
      }))
    }))
  })),
  delete: vi.fn(() => ({ where: txDeleteWhere })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: txUpdateWhere })) })),
  insert: vi.fn(() => ({ values: txInsertValues }))
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx))
  },
  auditEvents: {},
  investors: {
    id: "investors.id",
    authUserId: "investors.auth_user_id",
    email: "investors.email"
  },
  session: { userId: "session.user_id" },
  twoFactor: { userId: "two_factor.user_id" },
  user: { id: "user.id", twoFactorEnabled: "user.two_factor_enabled" }
}));

import { requireSuperAdmin } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { resetInvestorTwoFactor } from "@/lib/investors/two-factor-actions";

function mockSuperAdmin(userId = "auth-s1") {
  vi.mocked(requireSuperAdmin).mockResolvedValue({
    user: { id: userId, email: "ops@parkwise.test" },
    staff: { id: "s1", role: "super_admin", ibId: null },
    role: "super_admin"
  });
}

function queueRows(...rows: unknown[][]) {
  txSelectQueue.push(...rows);
}

describe("resetInvestorTwoFactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txSelectQueue.length = 0;
    txDeleteWhere.mockResolvedValue(undefined);
    txUpdateWhere.mockResolvedValue(undefined);
    txInsertValues.mockResolvedValue(undefined);
  });

  it("rejects callers who are not super admins", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("requires the actor's own two-factor authentication under lock", async () => {
    mockSuperAdmin();
    queueRows([{ twoFactorEnabled: false }]);

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({
      ok: false,
      error: "Enable two-factor on your own account before resetting an investor's."
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenCalledWith("update");
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects when the actor's user row is missing", async () => {
    mockSuperAdmin();
    queueRows([]);

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({
      ok: false,
      error: "Enable two-factor on your own account before resetting an investor's."
    });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("returns not found from the locked investor read", async () => {
    mockSuperAdmin();
    queueRows([{ twoFactorEnabled: true }], []);

    const result = await resetInvestorTwoFactor({ investorId: "missing" });

    expect(result).toEqual({ ok: false, error: "Investor not found." });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenCalledTimes(2);
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("refuses investors without a sign-in account", async () => {
    mockSuperAdmin();
    queueRows(
      [{ twoFactorEnabled: true }],
      [{ id: "inv1", authUserId: null, email: "a@b.c" }]
    );

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({ ok: false, error: "Investor has no sign-in account yet." });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("blocks a super admin resetting their own account through the investor path", async () => {
    mockSuperAdmin("auth-self");
    queueRows(
      [{ twoFactorEnabled: true }],
      [{ id: "inv1", authUserId: "auth-self", email: "a@b.c" }]
    );

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({
      ok: false,
      error: "Another super-admin must reset your two-factor access."
    });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("clears two-factor, revokes sessions, and audits inside the locked transaction", async () => {
    mockSuperAdmin();
    queueRows(
      [{ twoFactorEnabled: true }],
      [{ id: "inv1", authUserId: "auth-inv1", email: "a@b.c" }]
    );

    const result = await resetInvestorTwoFactor({ investorId: "inv1" });

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenNthCalledWith(1, "update");
    expect(selectFor).toHaveBeenNthCalledWith(2, "update");
    expect(db.select).not.toHaveBeenCalled();
    expect(tx.delete).toHaveBeenCalledTimes(2);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "investor.two_factor_reset",
        entityType: "investor",
        entityId: "inv1",
        actorUserId: "auth-s1"
      })
    );
  });

  it("rolls back credential and session changes when the audit insert fails", async () => {
    mockSuperAdmin();
    queueRows(
      [{ twoFactorEnabled: true }],
      [{ id: "inv1", authUserId: "auth-inv1", email: "a@b.c" }]
    );
    txInsertValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(resetInvestorTwoFactor({ investorId: "inv1" })).rejects.toThrow(
      "audit unavailable"
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledTimes(2);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });
});

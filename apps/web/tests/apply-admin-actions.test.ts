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

const selectLimit = vi.fn();
const txSelectFor = vi.fn();
const txUpdateWhere = vi.fn();
const txInsertValues = vi.fn();
const insertValues = vi.fn();
const txLimit = vi.fn((...args: unknown[]) => ({
  for: (...forArgs: unknown[]) => txSelectFor(...forArgs),
  then: (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown
  ) => Promise.resolve(selectLimit(...args)).then(resolve, reject)
}));
const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: txLimit,
        orderBy: vi.fn(() => ({ limit: txLimit }))
      }))
    }))
  })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: txUpdateWhere })) })),
  insert: vi.fn(() => ({ values: txInsertValues }))
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: selectLimit,
          orderBy: vi.fn(() => ({ limit: selectLimit }))
        }))
      }))
    })),
    transaction: vi.fn(async (fn: (txArg: unknown) => Promise<void>) => fn(tx)),
    insert: vi.fn(() => ({ values: insertValues }))
  },
  account: {},
  auditEvents: {},
  investorApplications: {},
  investors: {},
  inviteTokens: {},
  user: {}
}));

import { investorVisibleToStaff, requireStaff, requireSuperAdmin } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/send";
import { approveAndInvite, regenerateInvite } from "@/lib/apply/admin-actions";

type Role = "agent" | "ib" | "super_admin";

function mockStaff(role: Role) {
  const ctx = {
    user: { id: `auth-${role}`, email: `${role}@parkwise.test` },
    staff: { id: "s1", role, ibId: null },
    role
  };
  vi.mocked(requireStaff).mockResolvedValue(ctx);
  if (role === "super_admin") {
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
  } else {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));
  }
}

const activatedInvestor = {
  id: "inv1",
  authUserId: "auth-inv1",
  email: "investor@example.com",
  assignedAgentId: null,
  ibId: null,
  accountStatus: "active"
};

describe("regenerateInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txUpdateWhere.mockResolvedValue(undefined);
    txInsertValues.mockResolvedValue(undefined);
    insertValues.mockResolvedValue(undefined);
    txSelectFor.mockResolvedValue([activatedInvestor]);
  });

  it.each(["agent", "ib"] as const)("returns Forbidden for %s staff", async (role) => {
    mockStaff(role);

    const result = await regenerateInvite("inv1");

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("still requires an approved account before a super admin can regenerate", async () => {
    mockStaff("super_admin");
    selectLimit.mockResolvedValueOnce([{ ...activatedInvestor, authUserId: null }]);

    const result = await regenerateInvite("inv1");

    expect(result).toEqual({ ok: false, error: "Approve & invite first." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("super admin regenerates: invalidates old tokens, issues a new one, audits", async () => {
    mockStaff("super_admin");
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
    selectLimit.mockResolvedValue([activatedInvestor]);
    const result = await regenerateInvite("inv1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inviteUrl).toContain("/set-password?token=");
    expect(result.emailSent).toBe(true);
    // Old live tokens are invalidated and the replacement inserted atomically.
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ investorId: "inv1", createdBy: "auth-super_admin" })
    );
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "investor.invited", entityId: "inv1" })
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rolls back invite issuance and suppresses email when the audit write fails", async () => {
    mockStaff("super_admin");
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
    selectLimit.mockResolvedValueOnce([activatedInvestor]);
    txInsertValues
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("audit unavailable"));

    const result = await regenerateInvite("inv1");

    expect(result).toEqual({
      ok: false,
      error: "Could not create the invite. Please try again."
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("approveAndInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txUpdateWhere.mockResolvedValue(undefined);
    txInsertValues.mockResolvedValue(undefined);
    insertValues.mockResolvedValue(undefined);
    txSelectFor.mockResolvedValue([activatedInvestor]);
  });

  it("normal staff can still issue the first invite for a pending application", async () => {
    mockStaff("agent");
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
    selectLimit
      .mockResolvedValueOnce([{ ...activatedInvestor, authUserId: null, accountStatus: "pending_access" }])
      .mockResolvedValueOnce([{ id: "app1", status: "submitted" }])
      .mockResolvedValue([activatedInvestor]);
    insertValues.mockResolvedValue(undefined);

    const result = await approveAndInvite("inv1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inviteUrl).toContain("/set-password?token=");
    expect(requireSuperAdmin).not.toHaveBeenCalled();
  });

  it("an agent re-inviting an already-approved investor is now Forbidden", async () => {
    mockStaff("agent");
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
    selectLimit
      .mockResolvedValueOnce([activatedInvestor])
      .mockResolvedValueOnce([{ id: "app1", status: "approved" }]);

    const result = await approveAndInvite("inv1");

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

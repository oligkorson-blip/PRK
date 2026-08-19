import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn((value: Record<string, unknown>) => ({ where: updateWhere, value }));
  const update = vi.fn(() => ({ set: updateSet }));
  const auditValues = vi.fn(() => Promise.resolve());
  const insert = vi.fn(() => ({ values: auditValues }));
  const txSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn().mockResolvedValue([{ assignedAgentId: null, ibId: null }])
      }))
    }))
  }));
  const tx = { update, insert, select: txSelect };

  return {
    tx,
    select: vi.fn(),
    transaction: vi.fn(async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx)),
    updateReturning,
    updateSet,
    auditValues
  };
});

vi.mock("@/lib/auth/investor", () => ({
  ensureInvestor: vi.fn(),
  requireAdmin: vi.fn()
}));
vi.mock("@/lib/auth/staff", () => ({ investorVisibleToStaff: vi.fn() }));
vi.mock("@/lib/auth/gates", () => ({
  canExpressInterest: vi.fn(),
  isOnboardingComplete: vi.fn()
}));
vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/lib/aml/queries", () => ({ latestScreeningResult: vi.fn() }));
vi.mock("@/lib/interests/claim-pending", () => ({
  INTEREST_NOT_PENDING: "INTEREST_NOT_PENDING",
  wherePendingInterest: vi.fn(() => ({})),
  interpretPendingClaim: vi.fn((rows: unknown[]) => ({ claimed: rows.length > 0 }))
}));
vi.mock("@/lib/interests/validation", () => ({
  validateInterestAmount: vi.fn(),
  validateInterestNote: vi.fn(() => ({ ok: true, note: null }))
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction
  },
  assets: {},
  auditEvents: {},
  holdings: {},
  interestConfirmationApprovals: {},
  interests: {},
  investors: {},
  kycChecks: {}
}));

import { ensureInvestor, requireAdmin } from "@/lib/auth/investor";
import { canExpressInterest } from "@/lib/auth/gates";
import { investorVisibleToStaff } from "@/lib/auth/staff";
import { sendTransactionalEmail } from "@/lib/email/send";
import { validateInterestNote } from "@/lib/interests/validation";
import { declineInterest } from "@/lib/interests/admin-actions";
import { withdrawInterest } from "@/lib/interests/actions";

const interest = {
  id: "interest-1",
  investorId: "investor-1",
  assetId: "asset-1",
  amountEur: 12_500,
  status: "pending",
  adminNote: null
};

const investor = {
  id: "investor-1",
  authUserId: "investor-auth-1",
  email: "investor@parkwise.test",
  assignedAgentId: null,
  ibId: null,
  accountStatus: "active"
};

function mockSelectRows(rows: unknown[]) {
  const node: {
    from?: ReturnType<typeof vi.fn>;
    innerJoin?: ReturnType<typeof vi.fn>;
    where?: ReturnType<typeof vi.fn>;
    limit?: ReturnType<typeof vi.fn>;
  } = {};
  node.from = vi.fn(() => node);
  node.innerJoin = vi.fn(() => node);
  node.where = vi.fn(() => node);
  node.limit = vi.fn().mockResolvedValue(rows);
  mocks.select.mockImplementationOnce(() => node);
}

describe("transactional interest terminal actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(requireAdmin).mockResolvedValue({
      id: "admin-auth-1",
      email: "admin@parkwise.test",
      staffId: "staff-1",
      role: "super_admin",
      user: { id: "admin-auth-1", email: "admin@parkwise.test" },
      staff: { id: "staff-1", role: "super_admin", ibId: null }
    } as never);
    vi.mocked(ensureInvestor).mockResolvedValue(investor as never);
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
    vi.mocked(canExpressInterest).mockReturnValue(true);
    mocks.updateReturning.mockResolvedValue([{ id: interest.id }]);
    mocks.auditValues.mockResolvedValue(undefined);
  });

  it("commits staff decline and its audit event through the same transaction", async () => {
    mockSelectRows([
      {
        interest,
        asset: { id: "asset-1", slug: "dublin-central", name: "Dublin Central" },
        investor
      }
    ]);

    const result = await declineInterest({ interestId: interest.id });

    expect(result).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.insert).toHaveBeenCalledTimes(1);
    expect(mocks.auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-auth-1",
        action: "interest.declined",
        entityType: "interest",
        entityId: interest.id
      })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("keeps the internal admin note out of the decline email; sends only the investor message", async () => {
    // Pass notes through so the two fields can be told apart.
    vi.mocked(validateInterestNote).mockImplementation((note) => {
      const trimmed = (note ?? "").trim();
      return { ok: true as const, note: trimmed.length ? trimmed : null };
    });
    mockSelectRows([
      {
        interest,
        asset: { id: "asset-1", slug: "dublin-central", name: "Dublin Central" },
        investor
      }
    ]);

    const result = await declineInterest({
      interestId: interest.id,
      adminNote: "internal: ticket below strategy floor",
      investorMessage: "we cannot place this amount right now"
    });

    expect(result).toEqual({ ok: true });
    // Both fields land in the audit payload…
    expect(mocks.auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "interest.declined",
        payload: expect.objectContaining({
          adminNote: "internal: ticket below strategy floor",
          investorMessage: "we cannot place this amount right now"
        })
      })
    );
    // …but the investor email quotes only the investor-facing message.
    const emailCall = vi.mocked(sendTransactionalEmail).mock.calls[0]?.[0] as { text: string };
    expect(emailCall.text).toContain("Message from the team: we cannot place this amount right now");
    expect(emailCall.text).not.toContain("internal: ticket below strategy floor");
  });

  it("does not audit or email when another request already claimed the decline", async () => {
    mockSelectRows([
      {
        interest,
        asset: { id: "asset-1", slug: "dublin-central", name: "Dublin Central" },
        investor
      }
    ]);
    mocks.updateReturning.mockResolvedValueOnce([]);

    const result = await declineInterest({ interestId: interest.id });

    expect(result).toEqual({
      ok: false,
      error: "This interest is no longer pending and can no longer be declined."
    });
    expect(mocks.tx.insert).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("propagates a decline audit failure from inside the transaction", async () => {
    mockSelectRows([
      {
        interest,
        asset: { id: "asset-1", slug: "dublin-central", name: "Dublin Central" },
        investor
      }
    ]);
    mocks.auditValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(declineInterest({ interestId: interest.id })).rejects.toThrow("audit unavailable");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("commits investor withdrawal and its audit event through the same transaction", async () => {
    mockSelectRows([interest]);

    const result = await withdrawInterest({ interestId: interest.id });

    expect(result).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.insert).toHaveBeenCalledTimes(1);
    expect(mocks.auditValues).toHaveBeenCalledWith({
      actorUserId: "investor-auth-1",
      action: "interest.withdrawn",
      entityType: "interest",
      entityId: interest.id,
      payload: {}
    });
  });

  it("does not audit when another request already claimed the withdrawal", async () => {
    mockSelectRows([interest]);
    mocks.updateReturning.mockResolvedValueOnce([]);

    const result = await withdrawInterest({ interestId: interest.id });

    expect(result).toEqual({
      ok: false,
      error: "This interest can no longer be withdrawn."
    });
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it("propagates a withdrawal audit failure from inside the transaction", async () => {
    mockSelectRows([interest]);
    mocks.auditValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(withdrawInterest({ interestId: interest.id })).rejects.toThrow("audit unavailable");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

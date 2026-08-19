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

const mocks = vi.hoisted(() => {
  const selectLimit = vi.fn();
  const updateReturning = vi.fn(async () => [{ id: "inv1" }]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const insertValues = vi.fn();
  const updateAction = vi.fn(() => ({
    set: vi.fn(() => ({ where: updateWhere }))
  }));
  const insertAction = vi.fn(() => ({ values: insertValues }));
  const txSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ for: selectLimit }))
    }))
  }));
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ select: txSelect, update: updateAction, insert: insertAction })
  );
  return {
    selectLimit,
    updateReturning,
    updateWhere,
    insertValues,
    updateAction,
    insertAction,
    transaction
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mocks.selectLimit }))
      }))
    })),
    update: mocks.updateAction,
    insert: mocks.insertAction,
    transaction: mocks.transaction
  },
  auditEvents: {},
  documents: {},
  investors: {}
}));

const { selectLimit, updateReturning, insertValues } = mocks;

vi.mock("@/lib/storage/local", () => ({
  buildObjectKey: vi.fn(),
  deleteObject: vi.fn(),
  isStorageConfigured: vi.fn(),
  putObject: vi.fn()
}));
vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: vi.fn(async () => ({ sent: true }))
}));

import { requireAdmin } from "@/lib/auth/investor";
import { db } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email/send";
import { setKycStatus } from "@/lib/kyc/actions";

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

describe("setKycStatus staff scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an agent acting on an investor outside their book", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    selectLimit.mockResolvedValue([{ assignedAgentId: "a2", ibId: null }]);

    const result = await setKycStatus({ investorId: "inv1", status: "approved" });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects an unassigned investor for an agent", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    selectLimit.mockResolvedValue([{ assignedAgentId: null, ibId: null }]);

    const result = await setKycStatus({ investorId: "inv1", status: "approved" });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects an ib acting on an investor linked to another team", async () => {
    mockStaff({ role: "ib", staffId: "ib1" });
    selectLimit.mockResolvedValue([{ assignedAgentId: "a1", ibId: "ib2" }]);

    const result = await setKycStatus({ investorId: "inv1", status: "rejected", reason: "blurry" });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("lets an agent approve an investor in their own book", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    selectLimit.mockResolvedValue([{ assignedAgentId: "a1", ibId: null, kycStatus: "submitted" }]);

    const result = await setKycStatus({ investorId: "inv1", status: "approved" });

    expect(result).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "kyc.approved", entityId: "inv1" })
    );
  });

  it("lets an ib act on an investor linked to its team", async () => {
    mockStaff({ role: "ib", staffId: "ib1" });
    selectLimit.mockResolvedValue([
      { assignedAgentId: "a9", ibId: "ib1", kycStatus: "submitted" }
    ]);

    const result = await setKycStatus({ investorId: "inv1", status: "under_review" });

    expect(result).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("lets super_admin act on any investor", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    selectLimit.mockResolvedValue([
      { assignedAgentId: "a2", ibId: "ib2", kycStatus: "submitted" }
    ]);

    const result = await setKycStatus({ investorId: "inv1", status: "approved" });

    expect(result).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("returns not found when the investor does not exist", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    selectLimit.mockResolvedValue([]);

    const result = await setKycStatus({ investorId: "missing", status: "approved" });

    expect(result).toEqual({ ok: false, error: "Investor not found." });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("setKycStatus decision emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emails the investor on approval with the capital-at-risk footer", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    selectLimit.mockResolvedValue([
      { assignedAgentId: "a1", ibId: null, email: "inv@example.com", kycStatus: "submitted" }
    ]);

    const result = await setKycStatus({ investorId: "inv1", status: "approved" });

    expect(result).toEqual({ ok: true });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendTransactionalEmail).mock.calls[0][0];
    expect(call.to).toBe("inv@example.com");
    expect(call.subject).toMatch(/approved/i);
    expect(call.text).toContain("Capital at risk");
  });

  it("emails the reject reason and a resubmit link on rejection", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    selectLimit.mockResolvedValue([
      { assignedAgentId: "a1", ibId: null, email: "inv@example.com", kycStatus: "submitted" }
    ]);

    const result = await setKycStatus({
      investorId: "inv1",
      status: "rejected",
      reason: "ID photo is blurry"
    });

    expect(result).toEqual({ ok: true });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendTransactionalEmail).mock.calls[0][0];
    expect(call.to).toBe("inv@example.com");
    expect(call.text).toContain("ID photo is blurry");
    expect(call.text).toContain("/portal/kyc");
    expect(call.text).toContain("Capital at risk");
  });

  it("does not email on under_review", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    selectLimit.mockResolvedValue([
      { assignedAgentId: "a1", ibId: null, email: "inv@example.com", kycStatus: "submitted" }
    ]);

    const result = await setKycStatus({ investorId: "inv1", status: "under_review" });

    expect(result).toEqual({ ok: true });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("still succeeds when the email send throws", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    selectLimit.mockResolvedValue([
      { assignedAgentId: "a1", ibId: null, email: "inv@example.com", kycStatus: "submitted" }
    ]);
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error("smtp down"));

    const result = await setKycStatus({ investorId: "inv1", status: "approved" });

    expect(result).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});

describe("setKycStatus state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStaff({ role: "super_admin", staffId: "s1" });
  });

  function mockInvestor(kycStatus: string) {
    selectLimit.mockResolvedValue([
      { assignedAgentId: "a1", ibId: null, email: "inv@example.com", kycStatus }
    ]);
  }

  it("rejects approving an investor who never submitted (not_started)", async () => {
    mockInvestor("not_started");

    const result = await setKycStatus({ investorId: "inv1", status: "approved" });

    expect(result).toEqual({
      ok: false,
      error: "Cannot move KYC from not_started to approved."
    });
    expect(db.update).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects regressing an approved investor back to under_review", async () => {
    mockInvestor("approved");

    const result = await setKycStatus({ investorId: "inv1", status: "under_review" });

    expect(result).toEqual({
      ok: false,
      error: "Cannot move KYC from approved to under_review."
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects re-rejecting an already rejected investor", async () => {
    mockInvestor("rejected");

    const result = await setKycStatus({
      investorId: "inv1",
      status: "rejected",
      reason: "ID photo is blurry"
    });

    expect(result).toEqual({
      ok: false,
      error: "Cannot move KYC from rejected to rejected."
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("allows approving from under_review", async () => {
    mockInvestor("under_review");

    const result = await setKycStatus({ investorId: "inv1", status: "approved" });

    expect(result).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("allows rejecting from under_review with a reason", async () => {
    mockInvestor("under_review");

    const result = await setKycStatus({
      investorId: "inv1",
      status: "rejected",
      reason: "ID photo is blurry"
    });

    expect(result).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("keeps the reject-reason validation on allowed transitions", async () => {
    mockInvestor("submitted");

    const result = await setKycStatus({ investorId: "inv1", status: "rejected", reason: "no" });

    expect(result).toEqual({
      ok: false,
      error: "Reject reason required (at least 8 characters)."
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a stale decision when another reviewer changed the status", async () => {
    mockInvestor("under_review");
    updateReturning.mockResolvedValueOnce([]);

    const result = await setKycStatus({ investorId: "inv1", status: "approved" });

    expect(result).toEqual({
      ok: false,
      error: "KYC status changed while you were reviewing it. Refresh and try again."
    });
    expect(insertValues).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

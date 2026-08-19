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

const selectFor = vi.fn();
const insertValues = vi.fn(() => ({ returning: insertReturning }));
const insertReturning = vi.fn().mockResolvedValue([{ id: "check-1" }]);
const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ for: selectFor }))
    }))
  })),
  insert: vi.fn(() => ({ values: insertValues }))
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx))
  },
  auditEvents: { table: "auditEvents" },
  investors: {
    id: "investors.id",
    assignedAgentId: "investors.assignedAgentId",
    ibId: "investors.ibId"
  },
  kycChecks: { table: "kycChecks", id: "kycChecks.id" }
}));

import { requireAdmin } from "@/lib/auth/investor";
import { auditEvents, db, kycChecks } from "@/lib/db";
import { recordScreening } from "@/lib/aml/actions";

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

const validInput = {
  investorId: "inv1",
  result: "clear",
  screeningNote: "Sanctions and PEP lists checked, no hits.",
  sourceOfFundsNote: "Employment income per onboarding."
};

describe("recordScreening staff scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertReturning.mockResolvedValue([{ id: "check-1" }]);
  });

  it("rejects an agent acting on an investor outside their book under the row lock", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    selectFor.mockResolvedValue([{ assignedAgentId: "a2", ibId: null }]);

    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenCalledWith("update");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects an unassigned investor for an agent", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    selectFor.mockResolvedValue([{ assignedAgentId: null, ibId: null }]);

    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects an ib acting on an investor linked to another team", async () => {
    mockStaff({ role: "ib", staffId: "ib1" });
    selectFor.mockResolvedValue([{ assignedAgentId: "a1", ibId: "ib2" }]);

    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("lets an agent screen an investor in their own book", async () => {
    mockStaff({ role: "agent", staffId: "a1" });
    selectFor.mockResolvedValue([{ assignedAgentId: "a1", ibId: null }]);

    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: true, id: "check-1" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenCalledWith("update");
    expect(tx.insert).toHaveBeenNthCalledWith(1, kycChecks);
    expect(tx.insert).toHaveBeenNthCalledWith(2, auditEvents);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("lets an ib screen an investor linked to its team", async () => {
    mockStaff({ role: "ib", staffId: "ib1" });
    selectFor.mockResolvedValue([{ assignedAgentId: "a9", ibId: "ib1" }]);

    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: true, id: "check-1" });
  });

  it("lets super_admin screen any investor", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    selectFor.mockResolvedValue([{ assignedAgentId: "a2", ibId: "ib2" }]);

    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: true, id: "check-1" });
  });

  it("returns not found from the locked read when the investor does not exist", async () => {
    mockStaff({ role: "super_admin", staffId: "s1" });
    selectFor.mockResolvedValue([]);

    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: false, error: "Investor not found." });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenCalledWith("update");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("returns forbidden when the caller is not staff", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe("recordScreening persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertReturning.mockResolvedValue([{ id: "check-1" }]);
    mockStaff({ role: "super_admin", staffId: "s1" });
    selectFor.mockResolvedValue([{ assignedAgentId: null, ibId: null }]);
  });

  it("stores the reviewer staff id and review timestamp on the kyc_checks row", async () => {
    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: true, id: "check-1" });
    expect(insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        investorId: "inv1",
        result: "clear",
        screeningNote: validInput.screeningNote,
        sourceOfFundsNote: validInput.sourceOfFundsNote,
        reviewedByStaffId: "s1",
        reviewedAt: expect.any(Date)
      })
    );
  });

  it("writes an aml.screening_recorded audit event", async () => {
    await recordScreening({ ...validInput, result: "review" });

    expect(insertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actorUserId: "auth-s1",
        action: "aml.screening_recorded",
        entityType: "investor",
        entityId: "inv1",
        payload: { kycCheckId: "check-1", result: "review" }
      })
    );
  });

  it("stores a null source-of-funds note when blank", async () => {
    await recordScreening({ ...validInput, sourceOfFundsNote: "   " });

    expect(insertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sourceOfFundsNote: null })
    );
  });

  it("rejects an unknown screening result before touching the db", async () => {
    const result = await recordScreening({ ...validInput, result: "passed" });

    expect(result).toEqual({ ok: false, error: "Select a valid screening result." });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("locks scope, then inserts the screening and audit in one transaction", async () => {
    const result = await recordScreening(validInput);

    expect(result).toEqual({ ok: true, id: "check-1" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenCalledWith("update");
    expect(tx.insert).toHaveBeenNthCalledWith(1, kycChecks);
    expect(tx.insert).toHaveBeenNthCalledWith(2, auditEvents);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns a clean error and rolls back when the transaction fails", async () => {
    insertValues.mockImplementationOnce(() => ({ returning: insertReturning }));
    insertValues.mockImplementationOnce(() => {
      throw new Error("audit insert failed");
    });

    const result = await recordScreening(validInput);

    expect(result).toEqual({
      ok: false,
      error: "Could not record the screening. Please try again."
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing screening note before touching the db", async () => {
    const result = await recordScreening({ ...validInput, screeningNote: "no" });

    expect(result).toEqual({
      ok: false,
      error: "Screening note required (at least 8 characters)."
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

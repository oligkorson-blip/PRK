import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
  requireSessionUser: vi.fn()
}));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    ne: vi.fn((col: unknown, val: unknown) => ({ op: "ne", col, val })),
    isNull: vi.fn((col: unknown) => ({ op: "isNull", col })),
    and: vi.fn((...conditions: unknown[]) => ({ op: "and", conditions })),
    or: vi.fn((...conditions: unknown[]) => ({ op: "or", conditions }))
  };
});

const selectLimit = vi.fn();
const updateSet = vi.fn();
const updateReturning = vi.fn();
const updateWhere = vi.fn(() => ({ returning: updateReturning }));
const insertValues = vi.fn();
const tx = {
  update: vi.fn(() => ({
    set: vi.fn((values: unknown) => {
      updateSet(values);
      return { where: updateWhere };
    })
  })),
  insert: vi.fn(() => ({ values: insertValues }))
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ limit: selectLimit })) }))
    })),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx))
  },
  auditEvents: {},
  investors: {
    id: "investors.id",
    onboardingStatus: "investors.onboarding_status",
    termsAcceptedAt: "investors.terms_accepted_at",
    riskAcceptedAt: "investors.risk_accepted_at"
  }
}));

import { requireAdmin } from "@/lib/auth/investor";
import { db } from "@/lib/db";
import {
  assistedAcceptDeclarations,
  assistedOnboardingProfile
} from "@/lib/onboarding/assisted-actions";

const INVESTOR_ID = "11111111-1111-4111-8111-111111111111";

function staff(role: "super_admin" | "agent" | "ib", staffId = "staff-1") {
  return {
    id: "user-1",
    email: "staff@example.com",
    staffId,
    role,
    user: { id: "user-1", email: "staff@example.com" },
    staff: { id: staffId, role, ibId: null }
  };
}

function investorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVESTOR_ID,
    authUserId: "auth-inv-1",
    email: "jane@example.com",
    fullName: "Jane Investor",
    country: "Ireland",
    phone: "+353 1 234 5678",
    dateOfBirth: "1985-04-12",
    address: "12 Harbour Road, Sligo",
    nationality: "Irish",
    pepDeclaration: false,
    companyLegalName: null,
    countryOfIncorporation: null,
    companyNumber: null,
    onboardingStatus: "started",
    accountStatus: "active",
    kycStatus: "not_started",
    kycRejectReason: null,
    accountType: "individual",
    eligibilityAnswers: { investmentHorizon: "5-10", sourceOfFunds: "Savings" },
    termsAcceptedAt: null,
    riskAcceptedAt: null,
    assignedAgentId: "staff-1",
    ibId: null,
    ...overrides
  };
}

const validFields = {
  fullName: "Jane Investor",
  country: "Ireland",
  phone: "+353 9 999 9999",
  dateOfBirth: "1985-04-12",
  address: "12 Harbour Road, Sligo",
  nationality: "Irish",
  pepDeclaration: false,
  investmentHorizon: "5-10",
  sourceOfFunds: "Savings"
};

describe("assistedOnboardingProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    selectLimit.mockResolvedValue([investorRow()]);
    updateReturning.mockResolvedValue([{ id: INVESTOR_ID }]);
    insertValues.mockResolvedValue(undefined);
  });

  it("rejects an agent acting on an investor outside their book", async () => {
    selectLimit.mockResolvedValue([investorRow({ assignedAgentId: "staff-2" })]);

    const result = await assistedOnboardingProfile(INVESTOR_ID, validFields);

    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns not found when the investor does not exist", async () => {
    selectLimit.mockResolvedValue([]);

    const result = await assistedOnboardingProfile(INVESTOR_ID, validFields);

    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("saves a valid profile and audits the change", async () => {
    const result = await assistedOnboardingProfile(INVESTOR_ID, validFields);

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Jane Investor",
        phone: "+353 9 999 9999",
        dateOfBirth: "1985-04-12",
        eligibilityAnswers: expect.objectContaining({
          investmentHorizon: "5-10",
          sourceOfFunds: "Savings"
        })
      })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "onboarding.assisted_profile_saved",
        entityType: "investor",
        entityId: INVESTOR_ID
      })
    );
  });

  it("rolls back a profile save when its audit insert fails", async () => {
    insertValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(assistedOnboardingProfile(INVESTOR_ID, validFields)).rejects.toThrow(
      "audit unavailable"
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing phone when the field is blank", async () => {
    const result = await assistedOnboardingProfile(INVESTOR_ID, { ...validFields, phone: "" });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ phone: "+353 1 234 5678" }));
  });

  it("rejects an invalid profile without writing", async () => {
    const result = await assistedOnboardingProfile(INVESTOR_ID, { ...validFields, fullName: "J" });

    expect(result.ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("saves a company profile without date of birth or nationality", async () => {
    selectLimit.mockResolvedValue([investorRow({ accountType: "company" })]);

    const result = await assistedOnboardingProfile(INVESTOR_ID, {
      fullName: "Jane Director",
      country: "Ireland",
      phone: "",
      companyLegalName: "Harbour Holdings Ltd",
      countryOfIncorporation: "Ireland",
      companyNumber: "IE 123456",
      address: "12 Harbour Road, Sligo",
      pepDeclaration: false,
      investmentHorizon: "5-10",
      sourceOfFunds: "Company operating profits."
    });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        companyLegalName: "Harbour Holdings Ltd",
        countryOfIncorporation: "Ireland",
        companyNumber: "IE 123456",
        dateOfBirth: null,
        nationality: null
      })
    );
  });

  it("rejects a company profile missing the registration number", async () => {
    selectLimit.mockResolvedValue([investorRow({ accountType: "company" })]);

    const result = await assistedOnboardingProfile(INVESTOR_ID, {
      fullName: "Jane Director",
      country: "Ireland",
      phone: "",
      companyLegalName: "Harbour Holdings Ltd",
      countryOfIncorporation: "Ireland",
      companyNumber: "",
      address: "12 Harbour Road, Sligo",
      pepDeclaration: false,
      investmentHorizon: "5-10",
      sourceOfFunds: "Company operating profits."
    });

    expect(result.ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("assistedAcceptDeclarations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    selectLimit.mockResolvedValue([investorRow()]);
    updateReturning.mockResolvedValue([{ id: INVESTOR_ID }]);
    insertValues.mockResolvedValue(undefined);
  });

  it("rejects an agent acting on an investor outside their book", async () => {
    selectLimit.mockResolvedValue([investorRow({ assignedAgentId: null, ibId: null })]);

    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("refuses when the stored profile does not validate", async () => {
    selectLimit.mockResolvedValue([investorRow({ dateOfBirth: null })]);

    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({
      ok: false,
      error: "Profile is incomplete — save the onboarding profile first."
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("sets the same acceptance flags and status as completeOnboarding", async () => {
    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingStatus: "completed",
        termsAcceptedAt: expect.any(Date),
        riskAcceptedAt: expect.any(Date),
        eligibilityAnswers: expect.objectContaining({
          investmentHorizon: "5-10",
          sourceOfFunds: "Savings",
          isQualifyingInvestor: true,
          understandsCapitalAtRisk: true
        })
      })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "onboarding.assisted_completed",
        entityType: "investor",
        entityId: INVESTOR_ID
      })
    );
  });

  it("rolls back declaration completion when its audit insert fails", async () => {
    insertValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(assistedAcceptDeclarations(INVESTOR_ID)).rejects.toThrow("audit unavailable");

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate the audit when a concurrent completion wins", async () => {
    updateReturning.mockResolvedValueOnce([]);

    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("is a no-op success when onboarding is already complete", async () => {
    selectLimit.mockResolvedValue([
      investorRow({ onboardingStatus: "completed", termsAcceptedAt: new Date(), riskAcceptedAt: new Date() })
    ]);

    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({ ok: true });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("completes onboarding for a company without a stored date of birth", async () => {
    selectLimit.mockResolvedValue([
      investorRow({
        accountType: "company",
        dateOfBirth: null,
        nationality: null,
        companyLegalName: "Harbour Holdings Ltd",
        countryOfIncorporation: "Ireland",
        companyNumber: "IE 123456"
      })
    ]);

    const result = await assistedAcceptDeclarations(INVESTOR_ID);

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingStatus: "completed" })
    );
  });
});

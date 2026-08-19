import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/investor", () => ({ ensureInvestor: vi.fn() }));
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

import { ensureInvestor } from "@/lib/auth/investor";
import { db } from "@/lib/db";
import { completeOnboarding } from "@/lib/onboarding/actions";

function investorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    authUserId: "auth-inv-1",
    email: "jane@example.com",
    onboardingStatus: "started",
    termsAcceptedAt: null,
    riskAcceptedAt: null,
    accountType: "individual",
    ...overrides
  };
}

function baseFormData() {
  const fd = new FormData();
  fd.set("fullName", "Jane Investor");
  fd.set("country", "Ireland");
  fd.set("pepDeclaration", "no");
  fd.set("investmentHorizon", "5-10");
  fd.set("sourceOfFunds", "Employment income and prior investment proceeds.");
  fd.set("isQualifyingInvestor", "on");
  fd.set("understandsCapitalAtRisk", "on");
  fd.set("acceptTerms", "on");
  fd.set("acceptRisk", "on");
  return fd;
}

function individualFormData() {
  const fd = baseFormData();
  fd.set("dateOfBirth", "1985-04-12");
  fd.set("address", "12 Harbour Road, Sligo");
  fd.set("nationality", "Irish");
  return fd;
}

function companyFormData() {
  const fd = baseFormData();
  fd.set("fullName", "Jane Director");
  fd.set("companyLegalName", "Harbour Holdings Ltd");
  fd.set("countryOfIncorporation", "Ireland");
  fd.set("companyNumber", "IE 123456");
  fd.set("address", "12 Harbour Road, Sligo");
  return fd;
}

describe("completeOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateReturning.mockResolvedValue([{ id: "11111111-1111-4111-8111-111111111111" }]);
    insertValues.mockResolvedValue(undefined);
  });

  it("lets a company complete onboarding without a date of birth", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue(
      investorRow({ accountType: "company" }) as never
    );

    const result = await completeOnboarding({ ok: false, error: "" }, companyFormData());

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        companyLegalName: "Harbour Holdings Ltd",
        countryOfIncorporation: "Ireland",
        companyNumber: "IE 123456",
        dateOfBirth: null,
        nationality: null,
        onboardingStatus: "completed",
        termsAcceptedAt: expect.any(Date),
        riskAcceptedAt: expect.any(Date)
      })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "onboarding.completed" })
    );
  });

  it("rejects a company submission missing the registration number", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue(
      investorRow({ accountType: "company" }) as never
    );
    const fd = companyFormData();
    fd.delete("companyNumber");

    const result = await completeOnboarding({ ok: false, error: "" }, fd);

    expect(result.ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("still requires a date of birth for individuals", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue(investorRow() as never);
    const fd = individualFormData();
    fd.delete("dateOfBirth");

    const result = await completeOnboarding({ ok: false, error: "" }, fd);

    expect(result.ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects an individual applicant under 18", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue(investorRow() as never);
    const fd = individualFormData();
    const dob = new Date();
    dob.setUTCFullYear(dob.getUTCFullYear() - 17);
    fd.set("dateOfBirth", dob.toISOString().slice(0, 10));

    const result = await completeOnboarding({ ok: false, error: "" }, fd);

    expect(result).toEqual({ ok: false, error: "You must be at least 18 years old." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects an individual country outside the application list", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue(investorRow() as never);
    const fd = individualFormData();
    fd.set("country", "Atlantis");

    const result = await completeOnboarding({ ok: false, error: "" }, fd);

    expect(result.ok).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("completes onboarding for a valid individual", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue(investorRow() as never);

    const result = await completeOnboarding({ ok: false, error: "" }, individualFormData());

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        dateOfBirth: "1985-04-12",
        nationality: "Irish",
        onboardingStatus: "completed"
      })
    );
  });

  it("rolls back completion when the audit insert fails", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue(investorRow() as never);
    insertValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(
      completeOnboarding({ ok: false, error: "" }, individualFormData())
    ).resolves.toEqual({ ok: false, error: "We couldn't save your setup just yet. Please try again, or contact the team if it continues." });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate the audit when a concurrent completion wins", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue(investorRow() as never);
    updateReturning.mockResolvedValueOnce([]);

    const result = await completeOnboarding(
      { ok: false, error: "" },
      individualFormData()
    );

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("is a no-op success when onboarding is already complete", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue(
      investorRow({
        onboardingStatus: "completed",
        termsAcceptedAt: new Date(),
        riskAcceptedAt: new Date()
      }) as never
    );

    const result = await completeOnboarding({ ok: false, error: "" }, new FormData());

    expect(result).toEqual({ ok: true });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
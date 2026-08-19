import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({ ensureInvestor: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({ requireSuperAdmin: vi.fn() }));

// Token-returning spies so tests can assert which (column, value) pairs the
// module filters on — the whole point of the export is session scoping.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    and: vi.fn((...conds: unknown[]) => ({ op: "and", conds }))
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
  auditEvents: {},
  assets: { id: "assets.id", slug: "assets.slug", name: "assets.name" },
  distributions: {
    id: "distributions.id",
    investorId: "distributions.investor_id",
    createdAt: "distributions.created_at"
  },
  documents: {
    id: "documents.id",
    ownerType: "documents.owner_type",
    ownerId: "documents.owner_id",
    title: "documents.title",
    category: "documents.category",
    contentType: "documents.content_type",
    createdAt: "documents.created_at"
  },
  holdings: {
    id: "holdings.id",
    investorId: "holdings.investor_id",
    assetId: "holdings.asset_id",
    amountEur: "holdings.amount_eur",
    targetYieldPct: "holdings.target_yield_pct",
    status: "holdings.status",
    confirmedAt: "holdings.confirmed_at",
    createdAt: "holdings.created_at"
  },
  interests: {
    id: "interests.id",
    investorId: "interests.investor_id",
    assetId: "interests.asset_id",
    amountEur: "interests.amount_eur",
    optionId: "interests.option_id",
    note: "interests.note",
    status: "interests.status",
    createdAt: "interests.created_at",
    updatedAt: "interests.updated_at"
  },
  investorApplications: {
    id: "investor_applications.id",
    investorId: "investor_applications.investor_id",
    createdAt: "investor_applications.created_at"
  },
  investors: {
    id: "investors.id",
    authUserId: "investors.auth_user_id",
    email: "investors.email",
    createdAt: "investors.created_at"
  },
  kycChecks: {
    id: "kyc_checks.id",
    investorId: "kyc_checks.investor_id",
    reviewedAt: "kyc_checks.reviewed_at"
  },
  leads: { id: "leads.id", investorId: "leads.investor_id" },
  user: {
    id: "user.id",
    name: "user.name",
    email: "user.email",
    emailVerified: "user.email_verified",
    createdAt: "user.created_at",
    updatedAt: "user.updated_at"
  },
  userAccessEvents: {
    id: "user_access_events.id",
    authUserId: "user_access_events.auth_user_id",
    occurredAt: "user_access_events.occurred_at"
  }
}));

import { eq } from "drizzle-orm";
import { ensureInvestor } from "@/lib/auth/investor";
import { db } from "@/lib/db";
import { exportMyData } from "@/lib/privacy/actions";

const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
const eqMock = eq as unknown as ReturnType<typeof vi.fn>;

const INV = "inv-1";
const AUTH = "auth-1";
const NOW = new Date("2026-01-02T03:04:05.000Z");

/** Chainable select stub: works with .where()/.leftJoin()/.orderBy()/.limit() and plain await. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectChain(rows: unknown): any {
  const chain = Object.assign(Promise.resolve(rows), {
    limit: () => Promise.resolve(rows),
    orderBy: () => chain,
    leftJoin: () => chain,
    where: () => chain
  });
  return chain;
}

/** Queue one db.select chain per call, in call order. */
function mockSelects(results: unknown[]) {
  for (const rows of results) {
    selectMock.mockImplementationOnce(() => ({ from: () => selectChain(rows) }));
  }
}

function mockSessionInvestor(authUserId: string | null = AUTH) {
  vi.mocked(ensureInvestor).mockResolvedValue({
    id: INV,
    authUserId
  } as Awaited<ReturnType<typeof ensureInvestor>>);
}

describe("exportMyData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockImplementation(() => ({
      values: vi.fn().mockResolvedValue(undefined)
    }));
  });

  it("scopes every query to the session investor, audits the disclosure, and assembles the document", async () => {
    const auditValues = vi.fn().mockResolvedValue(undefined);
    insertMock.mockImplementationOnce(() => ({ values: auditValues }));
    mockSessionInvestor();
    mockSelects([
      [
        {
          id: INV,
          authUserId: AUTH,
          email: "jane@example.com",
          fullName: "Jane Doe",
          country: "IE",
          phone: "+3531000",
          accountType: "individual",
          onboardingStatus: "completed",
          accountStatus: "active",
          kycStatus: "approved",
          kycRejectReason: null,
          eligibilityAnswers: { pep: false },
          termsAcceptedAt: NOW,
          riskAcceptedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW
        }
      ],
      [
        {
          id: AUTH,
          name: "Jane Doe",
          email: "jane@example.com",
          emailVerified: true,
          createdAt: NOW,
          updatedAt: NOW
        }
      ],
      [
        {
          id: "lead-1",
          fullName: "Jane Doe",
          email: "jane@example.com",
          phone: "+3531000",
          notes: "Met at the Dublin roadshow.",
          createdAt: NOW,
          updatedAt: NOW
        }
      ],
      [
        {
          id: "app-1",
          accountType: "individual",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          phone: "+3531000",
          countryOfResidence: "IE",
          companyLegalName: null,
          countryOfIncorporation: null,
          investmentProfile: { ticketBand: "25k" },
          termsAcceptedAt: NOW,
          riskAcceptedAt: NOW,
          status: "approved",
          createdAt: NOW,
          updatedAt: NOW
        }
      ],
      [
        {
          id: "int-1",
          assetSlug: "alpha",
          assetName: "Alpha Hub",
          amountEur: 25000,
          optionId: null,
          note: null,
          status: "confirmed",
          createdAt: NOW,
          updatedAt: NOW
        }
      ],
      [
        {
          id: "hold-1",
          assetSlug: "alpha",
          assetName: "Alpha Hub",
          amountEur: 25000,
          targetYieldPct: "7.50",
          status: "active",
          confirmedAt: NOW,
          createdAt: NOW
        }
      ],
      [
        {
          id: "dist-1",
          holdingId: "hold-1",
          amountEur: 875,
          type: "income",
          status: "paid",
          periodLabel: "2025-Q4",
          paidAt: NOW,
          note: null,
          createdAt: NOW
        }
      ],
      [
        {
          id: "kyc-check-1",
          result: "clear",
          screeningNote: "Sanctions/PEP screen clear (ref VX-123).",
          sourceOfFundsNote: "Employment income, verified via payslips.",
          reviewedAt: NOW,
          createdAt: NOW
        }
      ],
      [
        {
          id: "doc-1",
          title: "passport.pdf",
          category: "kyc_id",
          contentType: "application/pdf",
          createdAt: NOW
        }
      ],
      [
        {
          id: "evt-1",
          occurredAt: NOW,
          ipAddress: "1.2.3.4",
          userAgent: "UA",
          uaBrowser: "Firefox",
          uaOs: "macOS",
          uaDevice: "desktop",
          countryCode: "IE",
          countryName: "Ireland",
          region: "D",
          city: "Dublin",
          timezone: "Europe/Dublin",
          isp: "ISP",
          org: "ORG",
          isProxy: false,
          isVpn: true,
          isDatacenter: false,
          enrichmentStatus: "ok",
          enrichmentSource: "api"
        }
      ]
    ]);

    const result = await exportMyData();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { data } = result;

    // Session-scoped predicates only — no client-supplied id can leak in.
    expect(eqMock).toHaveBeenCalledWith("investors.id", INV);
    expect(eqMock).toHaveBeenCalledWith("user.id", AUTH);
    expect(eqMock).toHaveBeenCalledWith("leads.investor_id", INV);
    expect(eqMock).toHaveBeenCalledWith("investor_applications.investor_id", INV);
    expect(eqMock).toHaveBeenCalledWith("interests.investor_id", INV);
    expect(eqMock).toHaveBeenCalledWith("holdings.investor_id", INV);
    expect(eqMock).toHaveBeenCalledWith("distributions.investor_id", INV);
    expect(eqMock).toHaveBeenCalledWith("kyc_checks.investor_id", INV);
    expect(eqMock).toHaveBeenCalledWith("documents.owner_type", "investor");
    expect(eqMock).toHaveBeenCalledWith("documents.owner_id", INV);
    expect(eqMock).toHaveBeenCalledWith("user_access_events.auth_user_id", AUTH);
    const filterValues = new Set(eqMock.mock.calls.map((call) => call[1]));
    expect(filterValues).toEqual(new Set([INV, AUTH, "investor", "assets.id"]));

    // Assembly: dates as ISO strings, KYC metadata only (no storageKey).
    expect(data.investor?.email).toBe("jane@example.com");
    expect(data.investor?.termsAcceptedAt).toBe(NOW.toISOString());
    expect(data.authUser?.id).toBe(AUTH);
    expect(data.lead).toEqual({
      id: "lead-1",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "+3531000",
      notes: "Met at the Dublin roadshow.",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString()
    });
    expect(data.applications[0]?.createdAt).toBe(NOW.toISOString());
    expect(data.interests[0]).toMatchObject({ assetSlug: "alpha", amountEur: 25000 });
    expect(data.holdings[0]).toMatchObject({ targetYieldPct: "7.50", status: "active" });
    expect(data.distributions[0]).toEqual({
      id: "dist-1",
      holdingId: "hold-1",
      amountEur: 875,
      type: "income",
      status: "paid",
      periodLabel: "2025-Q4",
      paidAt: NOW.toISOString(),
      note: null,
      createdAt: NOW.toISOString()
    });
    // Internal bookkeeping (idempotency keys) stays out.
    expect(data.distributions[0]).not.toHaveProperty("idempotencyKey");
    expect(data.kycChecks[0]).toEqual({
      id: "kyc-check-1",
      result: "clear",
      screeningNote: "Sanctions/PEP screen clear (ref VX-123).",
      sourceOfFundsNote: "Employment income, verified via payslips.",
      reviewedAt: NOW.toISOString(),
      createdAt: NOW.toISOString()
    });
    // Staff attribution stays internal.
    expect(data.kycChecks[0]).not.toHaveProperty("reviewedByStaffId");
    expect(data.kycDocuments[0]).toEqual({
      id: "doc-1",
      title: "passport.pdf",
      category: "kyc_id",
      contentType: "application/pdf",
      createdAt: NOW.toISOString()
    });
    expect(data.kycDocuments[0]).not.toHaveProperty("storageKey");
    expect(data.accessEvents[0]).toMatchObject({ ipAddress: "1.2.3.4", city: "Dublin" });
    expect(data.accessEvents[0]).not.toHaveProperty("enrichmentRaw");
    expect(typeof data.generatedAt).toBe("string");
    expect(auditValues).toHaveBeenCalledWith({
      actorUserId: AUTH,
      action: "investor.data_exported",
      entityType: "investor",
      entityId: INV,
      payload: { format: "json", generatedAt: data.generatedAt }
    });
  });

  it("withholds the export when its audit event cannot be persisted", async () => {
    mockSessionInvestor();
    mockSelects(Array.from({ length: 10 }, () => []));
    insertMock.mockImplementationOnce(() => ({
      values: vi.fn().mockRejectedValue(new Error("audit unavailable"))
    }));

    const result = await exportMyData();

    expect(result).toEqual({
      ok: false,
      error: "Could not prepare your data export. Try again."
    });
  });

  it("rejects an inconsistent session investor without an attributable auth user", async () => {
    mockSessionInvestor(null);

    const result = await exportMyData();

    expect(result).toEqual({ ok: false, error: "Unauthenticated." });
    expect(selectMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns Unauthenticated without touching the db when there is no session", async () => {
    vi.mocked(ensureInvestor).mockRejectedValue(new Error("UNAUTHENTICATED"));

    const result = await exportMyData();

    expect(result).toEqual({ ok: false, error: "Unauthenticated." });
    expect(selectMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

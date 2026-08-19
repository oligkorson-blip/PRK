import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/staff", () => ({ requireStaff: vi.fn() }));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    asc: vi.fn((col: unknown) => ({ asc: col })),
    desc: vi.fn((col: unknown) => ({ desc: col }))
  };
});

const investorsOrderBy = vi.fn();
const checksOrderBy = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
  investors: {
    id: "investors.id",
    email: "investors.email",
    fullName: "investors.fullName",
    kycStatus: "investors.kycStatus",
    pepDeclaration: "investors.pepDeclaration",
    ibId: "investors.ibId",
    assignedAgentId: "investors.assignedAgentId"
  },
  kycChecks: {
    id: "kycChecks.id",
    investorId: "kycChecks.investorId",
    result: "kycChecks.result",
    screeningNote: "kycChecks.screeningNote",
    sourceOfFundsNote: "kycChecks.sourceOfFundsNote",
    reviewedAt: "kycChecks.reviewedAt"
  }
}));

import { desc } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { listAmlChecklistForStaff } from "@/lib/aml/queries";

const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

const investorRow = {
  id: "inv-1",
  email: "inv@parkwise.test",
  fullName: "Investor One",
  kycStatus: "approved",
  pepDeclaration: false
};

function queueSelects(input: { investors: unknown[]; checks: unknown[] }) {
  investorsOrderBy.mockResolvedValue(input.investors);
  checksOrderBy.mockResolvedValue(input.checks);
  selectMock
    .mockImplementationOnce((() => ({ from: () => ({ orderBy: investorsOrderBy }) })) as never)
    .mockImplementationOnce(
      (() => ({ from: () => ({ where: () => ({ orderBy: checksOrderBy }) }) })) as never
    );
}

describe("listAmlChecklistForStaff latest-screening ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireStaff).mockResolvedValue({
      role: "super_admin",
      staff: { id: "s1", role: "super_admin", ibId: null }
    } as never);
  });

  it("orders the screening lookup by reviewedAt desc with an id desc tie-break", async () => {
    // Same recency rule as latestScreeningResult (the confirmInterest gate), so
    // equal timestamps resolve deterministically and the UI can never disagree.
    queueSelects({ investors: [investorRow], checks: [] });

    await listAmlChecklistForStaff();

    expect(desc).toHaveBeenCalledWith("kycChecks.reviewedAt");
    expect(desc).toHaveBeenCalledWith("kycChecks.id");
    expect(checksOrderBy).toHaveBeenCalledWith(
      { desc: "kycChecks.reviewedAt" },
      { desc: "kycChecks.id" }
    );
  });

  it("treats the first ordered row as the investor's latest screening", async () => {
    const reviewedAt = new Date("2026-07-01T10:00:00Z");
    queueSelects({
      investors: [investorRow],
      checks: [
        // Equal timestamps: the id tie-break has already ordered these, so the
        // first row (higher id) is the one the gate would also see.
        {
          id: "check-2",
          investorId: "inv-1",
          result: "review",
          screeningNote: "second",
          sourceOfFundsNote: null,
          reviewedAt
        },
        {
          id: "check-1",
          investorId: "inv-1",
          result: "clear",
          screeningNote: "first",
          sourceOfFundsNote: null,
          reviewedAt
        }
      ]
    });

    const rows = await listAmlChecklistForStaff();

    expect(rows).toHaveLength(1);
    expect(rows[0].latestCheck?.id).toBe("check-2");
    expect(rows[0].latestCheck?.result).toBe("review");
  });
});

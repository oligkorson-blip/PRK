import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/investor", () => ({
  ensureInvestor: vi.fn(),
  requireAdmin: vi.fn()
}));
vi.mock("@/lib/auth/session", () => ({ requireSessionUser: vi.fn() }));
vi.mock("@/lib/investors/queries", () => ({ findInvestorByAuthUserId: vi.fn() }));

// Token-returning spies so the mocked tables (empty objects) never reach real
// drizzle query builders.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    and: vi.fn((...conds: unknown[]) => ({ op: "and", conds })),
    inArray: vi.fn((col: unknown, vals: unknown) => ({ op: "inArray", col, vals })),
    desc: vi.fn((col: unknown) => ({ op: "desc", col })),
    or: vi.fn((...conds: unknown[]) => ({ op: "or", conds }))
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
  assets: {},
  auditEvents: {},
  documents: {},
  holdings: {},
  interests: {},
  investors: {},
  staffProfiles: {}
}));

import { db } from "@/lib/db";
import { listDocumentsForAdmin } from "@/lib/documents/queries";

const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

/** Queue the vault listing chain (terminal `.orderBy()`). */
function mockDocsSelect(rows: unknown[]) {
  const terminal = { orderBy: () => Promise.resolve(rows) };
  const where = () => terminal;
  const fourthJoin = () => ({ where });
  const thirdJoin = () => ({ leftJoin: fourthJoin });
  const secondJoin = () => ({ leftJoin: thirdJoin });
  const firstJoin = () => ({ leftJoin: secondJoin });

  selectMock.mockImplementationOnce(() => ({
    from: () => ({ leftJoin: firstJoin })
  }));
}

/** Queue a batch-lookup chain (terminal `.where()`, optional innerJoin in between). */
function mockWhereSelect(rows: unknown[]) {
  const whereResult = Promise.resolve(rows);
  selectMock.mockImplementationOnce(() => ({
    from: () => ({
      where: () => whereResult,
      innerJoin: () => ({ where: () => whereResult })
    })
  }));
}

const DOC_COLUMNS = {
  title: "Passport",
  category: "kyc",
  storageKey: "key",
  contentType: "application/pdf",
  uploadedBy: "staff-auth-1",
  createdAt: new Date("2026-07-20T00:00:00Z"),
  retractedAt: null
};

describe("listDocumentsForAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the investor owner through: agents see their own book's KYC docs, not other books'", async () => {
    mockDocsSelect([
      {
        doc: { ...DOC_COLUMNS, id: "d-own", ownerType: "investor", ownerId: "inv-own" },
        uploaderEmail: null
      },
      {
        doc: { ...DOC_COLUMNS, id: "d-other", ownerType: "investor", ownerId: "inv-other" },
        uploaderEmail: null
      }
    ]);
    // Investor-owner meta batch (no holding docs, so the holdings query is skipped).
    mockWhereSelect([
      { id: "inv-own", assignedAgentId: "agent-1", ibId: "ib-1", email: "own@example.com" },
      { id: "inv-other", assignedAgentId: "agent-2", ibId: "ib-2", email: "other@example.com" }
    ]);

    const rows = await listDocumentsForAdmin({ role: "agent", staffId: "agent-1" });

    expect(rows.map((r) => r.id)).toEqual(["d-own"]);
    expect(rows[0]?.ownerName).toBe("own@example.com");
    // No visible asset docs, so the asset-name batch never runs.
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it("scopes investor KYC docs to the IB's team book", async () => {
    mockDocsSelect([
      {
        doc: { ...DOC_COLUMNS, id: "d-team", ownerType: "investor", ownerId: "inv-team" },
        uploaderEmail: null
      }
    ]);
    mockWhereSelect([
      { id: "inv-team", assignedAgentId: "agent-2", ibId: "ib-1", email: "team@example.com" }
    ]);

    const rows = await listDocumentsForAdmin({ role: "ib", staffId: "ib-1" });

    expect(rows.map((r) => r.id)).toEqual(["d-team"]);
  });

  it("keeps holding docs scoped through the holding owner (fail-closed cross-book)", async () => {
    mockDocsSelect([
      {
        doc: { ...DOC_COLUMNS, id: "d-hold", ownerType: "holding", ownerId: "holding-1" },
        uploaderEmail: null
      }
    ]);
    // Holdings batch: the holding belongs to another agent's investor.
    mockWhereSelect([
      { holdingId: "holding-1", assignedAgentId: "agent-2", ibId: "ib-2", investorEmail: "x@example.com" }
    ]);

    const rows = await listDocumentsForAdmin({ role: "agent", staffId: "agent-1" });

    expect(rows).toEqual([]);
  });
});

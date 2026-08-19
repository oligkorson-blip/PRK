import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({
  ensureInvestor: vi.fn(),
  requireAdmin: vi.fn()
}));
vi.mock("@/lib/auth/session", () => ({ requireSessionUser: vi.fn() }));

// Token-returning spies so tests can assert which (column, value) pairs the
// access-set queries filter on.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    and: vi.fn((...conds: unknown[]) => ({ op: "and", conds })),
    inArray: vi.fn((col: unknown, vals: unknown) => ({ op: "inArray", col, vals }))
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
  assets: {},
  documents: {},
  investors: {},
  investorApplications: {},
  interests: {
    assetId: "interests.asset_id",
    investorId: "interests.investor_id",
    status: "interests.status"
  },
  holdings: {
    id: "holdings.id",
    assetId: "holdings.asset_id",
    investorId: "holdings.investor_id"
  },
  staffProfiles: {},
  auditEvents: {}
}));
vi.mock("@/lib/storage/local", () => ({
  buildObjectKey: vi.fn(),
  deleteObject: vi.fn(),
  isStorageConfigured: vi.fn(),
  putObject: vi.fn()
}));

import { ensureInvestor } from "@/lib/auth/investor";
import { db } from "@/lib/db";
import {
  getInvestorDocumentAccessSets,
  listDocumentsForInvestor
} from "@/lib/documents/queries";

const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

const INV = "inv-1";

function mockSessionInvestor() {
  vi.mocked(ensureInvestor).mockResolvedValue({
    id: INV
  } as Awaited<ReturnType<typeof ensureInvestor>>);
}

/** Queue one db.select chain per call, capturing each where clause. */
function mockSelects(results: unknown[][], wheres: unknown[]) {
  for (const rows of results) {
    selectMock.mockImplementationOnce(() => ({
      from: () => ({
        where: (clause: unknown) => {
          wheres.push(clause);
          return Promise.resolve(rows);
        }
      })
    }));
  }
}

describe("document list server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not accept a client-supplied investorId (session-scoped)", () => {
    expect(listDocumentsForInvestor.length).toBe(0);
    expect(getInvestorDocumentAccessSets.length).toBe(0);
  });

  it("scopes asset access to pending/confirmed interests — declined and withdrawn lose access", async () => {
    mockSessionInvestor();
    const wheres: unknown[] = [];
    mockSelects(
      [
        [{ assetId: "asset-1" }], // interests (already status-filtered by SQL)
        [{ id: "holding-1", assetId: "asset-2" }] // holdings
      ],
      wheres
    );

    const access = await getInvestorDocumentAccessSets();

    expect(access.relatedAssetIds).toEqual(new Set(["asset-1", "asset-2"]));
    expect(access.ownedHoldingIds).toEqual(new Set(["holding-1"]));
    // The interest lookup keeps pending + confirmed and drops declined/withdrawn.
    expect(wheres[0]).toEqual({
      op: "and",
      conds: [
        { op: "eq", col: "interests.investor_id", val: INV },
        { op: "inArray", col: "interests.status", vals: ["pending", "confirmed"] }
      ]
    });
  });

  it("does not filter holdings by status — closed holdings keep document access", async () => {
    mockSessionInvestor();
    const wheres: unknown[] = [];
    mockSelects([[], [{ id: "holding-1", assetId: "asset-2" }]], wheres);

    const access = await getInvestorDocumentAccessSets();

    expect(access.ownedHoldingIds).toEqual(new Set(["holding-1"]));
    expect(wheres[1]).toEqual({ op: "eq", col: "holdings.investor_id", val: INV });
  });
});

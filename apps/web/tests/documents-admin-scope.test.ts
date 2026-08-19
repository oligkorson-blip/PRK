import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alias: vi.fn((table: Record<string, unknown>, name: string) =>
    Object.fromEntries(Object.keys(table).map((key) => [key, `${name}.${key}`]))
  ),
  and: vi.fn((...conditions: unknown[]) => ({ op: "and", conditions })),
  dbSelect: vi.fn(),
  desc: vi.fn((column: unknown) => ({ op: "desc", column })),
  eq: vi.fn((column: unknown, value: unknown) => ({ op: "eq", column, value })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ op: "inArray", column, values })),
  isNull: vi.fn((column: unknown) => ({ op: "isNull", column })),
  or: vi.fn((...conditions: unknown[]) => ({ op: "or", conditions })),
  staffCanAccessAdminDocument: vi.fn(() => true)
}));

vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  desc: mocks.desc,
  eq: mocks.eq,
  inArray: mocks.inArray,
  isNull: mocks.isNull,
  or: mocks.or
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: mocks.alias
}));

vi.mock("@/lib/auth/investor", () => ({
  ensureInvestor: vi.fn(),
  requireAdmin: vi.fn()
}));

vi.mock("@/lib/auth/gates", () => ({
  isOnboardingComplete: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  requireSessionUser: vi.fn()
}));

vi.mock("@/lib/documents/access", () => ({
  canAccessDocument: vi.fn(),
  staffCanAccessAdminDocument: mocks.staffCanAccessAdminDocument
}));

vi.mock("@/lib/format", () => ({
  isUuid: vi.fn()
}));

vi.mock("@/lib/investors/queries", () => ({
  findInvestorByAuthUserId: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  assets: {
    id: "assets.id",
    name: "assets.name"
  },
  auditEvents: {
    id: "auditEvents.id"
  },
  db: {
    select: mocks.dbSelect
  },
  documents: {
    createdAt: "documents.createdAt",
    ownerId: "documents.ownerId",
    ownerType: "documents.ownerType",
    uploadedBy: "documents.uploadedBy"
  },
  holdings: {
    id: "holdings.id",
    investorId: "holdings.investorId"
  },
  interests: {
    investorId: "interests.investorId"
  },
  investors: {
    assignedAgentId: "investors.assignedAgentId",
    email: "investors.email",
    ibId: "investors.ibId",
    id: "investors.id"
  },
  staffProfiles: {
    authUserId: "staffProfiles.authUserId",
    email: "staffProfiles.email"
  }
}));

import { listDocumentsForAdmin } from "@/lib/documents/queries";

function configureQuery(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const fourthJoin = vi.fn().mockReturnValue({ where, orderBy });
  const thirdJoin = vi.fn().mockReturnValue({ leftJoin: fourthJoin });
  const secondJoin = vi.fn().mockReturnValue({ leftJoin: thirdJoin });
  const firstJoin = vi.fn().mockReturnValue({ leftJoin: secondJoin });
  const from = vi.fn().mockReturnValue({ leftJoin: firstJoin });

  mocks.dbSelect.mockReturnValue({ from });

  return { where };
}

const platformRow = {
  doc: {
    id: "document-1",
    ownerType: "platform",
    ownerId: null,
    createdAt: new Date("2026-08-03T00:00:00.000Z")
  },
  uploaderEmail: null
};

describe("listDocumentsForAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      role: "super_admin" as const,
      staffId: "super-1",
      expected: undefined
    },
    {
      role: "ib" as const,
      staffId: "ib-1",
      expected: {
        op: "or",
        conditions: [
          {
            op: "inArray",
            column: "documents.ownerType",
            values: ["platform", "asset"]
          },
          {
            op: "and",
            conditions: [
              { op: "eq", column: "documents.ownerType", value: "investor" },
              {
                op: "eq",
                column: "document_investor_owner.ibId",
                value: "ib-1"
              }
            ]
          },
          {
            op: "and",
            conditions: [
              { op: "eq", column: "documents.ownerType", value: "holding" },
              {
                op: "eq",
                column: "document_holding_investor_owner.ibId",
                value: "ib-1"
              }
            ]
          }
        ]
      }
    },
    {
      role: "agent" as const,
      staffId: "agent-1",
      expected: {
        op: "or",
        conditions: [
          {
            op: "inArray",
            column: "documents.ownerType",
            values: ["platform", "asset"]
          },
          {
            op: "and",
            conditions: [
              { op: "eq", column: "documents.ownerType", value: "investor" },
              {
                op: "eq",
                column: "document_investor_owner.assignedAgentId",
                value: "agent-1"
              }
            ]
          },
          {
            op: "and",
            conditions: [
              { op: "eq", column: "documents.ownerType", value: "holding" },
              {
                op: "eq",
                column: "document_holding_investor_owner.assignedAgentId",
                value: "agent-1"
              }
            ]
          }
        ]
      }
    }
  ])("applies the $role book scope in SQL", async ({ role, staffId, expected }) => {
    const { where } = configureQuery([platformRow]);

    await expect(
      listDocumentsForAdmin({ role, staffId })
    ).resolves.toEqual([
      {
        ...platformRow.doc,
        uploaderEmail: null,
        ownerName: null
      }
    ]);

    if (expected === undefined) {
      expect(where).not.toHaveBeenCalled();
    } else {
      expect(where).toHaveBeenCalledWith(expected);
    }
    expect(mocks.dbSelect).toHaveBeenCalledOnce();
  });
});

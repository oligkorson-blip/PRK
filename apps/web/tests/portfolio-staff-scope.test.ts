import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ op: "and", conditions })),
  dbSelect: vi.fn(),
  desc: vi.fn((column: unknown) => ({ op: "desc", column })),
  eq: vi.fn((column: unknown, value: unknown) => ({ op: "eq", column, value })),
  investorVisibleToStaff: vi.fn(() => true),
  requireAdmin: vi.fn()
}));

vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  desc: mocks.desc,
  eq: mocks.eq
}));

vi.mock("@/lib/auth/investor", () => ({
  requireAdmin: mocks.requireAdmin
}));

vi.mock("@/lib/auth/staff", () => ({
  investorVisibleToStaff: mocks.investorVisibleToStaff
}));

vi.mock("@/lib/db", () => ({
  assets: {
    id: "assets.id",
    name: "assets.name"
  },
  db: {
    select: mocks.dbSelect
  },
  distributions: {
    id: "distributions.id"
  },
  holdings: {
    id: "holdings.id",
    amountEur: "holdings.amountEur",
    assetId: "holdings.assetId",
    confirmedAt: "holdings.confirmedAt",
    investorId: "holdings.investorId",
    status: "holdings.status"
  },
  investors: {
    assignedAgentId: "investors.assignedAgentId",
    email: "investors.email",
    ibId: "investors.ibId",
    id: "investors.id"
  }
}));

import { listActiveHoldingsForAdmin } from "@/lib/portfolio/queries";

function configureQuery(rows: unknown[] = []) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const secondJoin = vi.fn().mockReturnValue({ where });
  const firstJoin = vi.fn().mockReturnValue({ innerJoin: secondJoin });
  const from = vi.fn().mockReturnValue({ innerJoin: firstJoin });

  mocks.dbSelect.mockReturnValue({ from });

  return { where, orderBy };
}

describe("listActiveHoldingsForAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      role: "super_admin" as const,
      staffId: "super-1",
      expected: { op: "eq", column: "holdings.status", value: "active" }
    },
    {
      role: "ib" as const,
      staffId: "ib-1",
      expected: {
        op: "and",
        conditions: [
          { op: "eq", column: "holdings.status", value: "active" },
          { op: "eq", column: "investors.ibId", value: "ib-1" }
        ]
      }
    },
    {
      role: "agent" as const,
      staffId: "agent-1",
      expected: {
        op: "and",
        conditions: [
          { op: "eq", column: "holdings.status", value: "active" },
          { op: "eq", column: "investors.assignedAgentId", value: "agent-1" }
        ]
      }
    }
  ])("applies the $role book scope in SQL", async ({ role, staffId, expected }) => {
    const rows = [
      {
        id: "holding-1",
        assignedAgentId: role === "agent" ? staffId : "agent-1",
        ibId: role === "ib" ? staffId : "ib-1"
      }
    ];
    const { where } = configureQuery(rows);
    mocks.requireAdmin.mockResolvedValue({
      role,
      staff: { id: staffId }
    });

    await expect(listActiveHoldingsForAdmin()).resolves.toEqual(rows);
    expect(where).toHaveBeenCalledWith(expected);
  });
});

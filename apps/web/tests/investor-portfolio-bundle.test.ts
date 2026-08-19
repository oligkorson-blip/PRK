import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  investorVisibleToStaff: vi.fn()
}));
vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
  assets: {},
  distributions: {},
  documents: {},
  holdings: {},
  interests: {},
  investorApplications: {},
  investors: {},
  staffProfiles: {}
}));

import { investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { getInvestorApplicationBundle } from "@/lib/investors/queries";

const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

/**
 * Queue one select chain resolving to `rows`. Every builder method returns the
 * same thenable chain, so it tolerates from → [innerJoin] → where → [orderBy]
 * → [limit] in any combination the bundle uses.
 */
function queueSelect(rows: unknown) {
  const thenable = Promise.resolve(rows) as Promise<unknown> & Record<string, unknown>;
  thenable.where = () => thenable;
  thenable.innerJoin = () => thenable;
  thenable.leftJoin = () => thenable;
  thenable.orderBy = () => thenable;
  thenable.limit = () => Promise.resolve(rows);
  selectMock.mockImplementationOnce(() => ({ from: () => thenable }));
}

const SUPER_ADMIN = {
  user: { id: "user-1", email: "admin@example.com" },
  staff: { id: "staff-1", role: "super_admin", ibId: null },
  role: "super_admin"
} as const;

describe("getInvestorApplicationBundle portfolio fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireStaff).mockResolvedValue(SUPER_ADMIN as never);
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
  });

  it("returns holdings with asset names and distributions with numeric amounts", async () => {
    queueSelect([{ assignedAgentId: null, ibId: null }]); // scoped investor lookup
    queueSelect([]); // application
    queueSelect([]); // kyc docs
    queueSelect([]); // interests
    queueSelect([
      {
        id: "h1",
        amountEur: 25000,
        targetYieldPct: "8.50",
        status: "active",
        confirmedAt: new Date("2026-01-10T00:00:00Z"),
        assetName: "M12 Services",
        assetSlug: "m12-services"
      }
    ]); // holdings
    queueSelect([
      {
        id: "d1",
        amountEur: 425,
        type: "income",
        status: "paid",
        periodLabel: "2026-Q1",
        paidAt: new Date("2026-04-05T00:00:00Z"),
        createdAt: new Date("2026-04-05T00:00:00Z")
      }
    ]); // distributions

    const bundle = await getInvestorApplicationBundle("inv-1");

    expect(bundle.holdings).toEqual([
      {
        id: "h1",
        amountEur: 25000,
        targetYieldPct: "8.50",
        status: "active",
        confirmedAt: new Date("2026-01-10T00:00:00Z"),
        assetName: "M12 Services",
        assetSlug: "m12-services"
      }
    ]);
    expect(bundle.distributions).toHaveLength(1);
    expect(bundle.distributions[0]).toMatchObject({
      id: "d1",
      amountEur: 425,
      type: "income",
      status: "paid"
    });
    expect(typeof bundle.distributions[0].amountEur).toBe("number");
  });

  it("throws NOT_FOUND when the investor is out of the staff member's scope", async () => {
    vi.mocked(investorVisibleToStaff).mockReturnValue(false);
    queueSelect([{ assignedAgentId: "agent-9", ibId: "ib-9" }]);

    await expect(getInvestorApplicationBundle("inv-1")).rejects.toThrow("NOT_FOUND");
  });
});

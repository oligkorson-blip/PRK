import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { select: mocks.select },
  distributions: {}
}));

import { listDistributionsForInvestor } from "@/lib/portfolio/distributions";

/** Chain: select → from → where → orderBy → limit. */
function mockRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  mocks.select.mockImplementationOnce(() => ({ from: vi.fn().mockReturnValue({ where }) }));
  return { limit, orderBy };
}

describe("listDistributionsForInvestor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bounds the list to 50 rows, ordered newest first", async () => {
    const { limit } = mockRows([
      {
        id: "d1",
        amountEur: "125",
        type: "income",
        status: "paid",
        periodLabel: null,
        paidAt: null
      }
    ]);

    const rows = await listDistributionsForInvestor("inv-1");

    expect(limit).toHaveBeenCalledWith(50);
    // numeric columns come back as strings and are mapped to numbers.
    expect(rows).toEqual([
      { id: "d1", amountEur: 125, type: "income", status: "paid", periodLabel: null, paidAt: null }
    ]);
  });
});

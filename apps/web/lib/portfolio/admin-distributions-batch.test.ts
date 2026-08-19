import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/investor", () => ({
  requireAdmin: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn()
  },
  assets: {},
  auditEvents: {},
  distributionApprovals: {},
  distributions: {},
  holdings: {},
  investors: {}
}));

vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: vi.fn()
}));

describe("recordDistributionBatch", () => {
  it("rejects an empty batch without calling recordDistribution", async () => {
    const { recordDistributionBatch } = await import("@/lib/portfolio/admin-distributions");
    const result = await recordDistributionBatch({ items: [] });
    expect(result).toEqual({ ok: false, error: "Select at least one investment." });
  });

  it("rejects oversized batches", async () => {
    const { recordDistributionBatch } = await import("@/lib/portfolio/admin-distributions");
    const items = Array.from({ length: 51 }, (_, i) => ({
      holdingId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      amountEur: 100
    }));
    const result = await recordDistributionBatch({ items });
    expect(result).toEqual({
      ok: false,
      error: "Batch is limited to 50 investments at a time."
    });
  });
});

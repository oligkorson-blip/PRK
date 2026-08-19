import { describe, expect, it } from "vitest";
import {
  formatDistributionStatus,
  formatDistributionType,
  sumPaidIncomeEur
} from "@/lib/portfolio/distributions";

describe("distribution helpers", () => {
  it("formats type and status for investors", () => {
    expect(formatDistributionType("income")).toBe("Income");
    expect(formatDistributionType("return_of_capital")).toBe("Return of capital");
    expect(formatDistributionStatus("paid")).toBe("Paid");
    expect(formatDistributionStatus("scheduled")).toBe("Scheduled");
  });

  it("sums only paid income rows", () => {
    const total = sumPaidIncomeEur([
      {
        id: "1",
        amountEur: 100,
        type: "income",
        status: "paid",
        periodLabel: "Jun",
        paidAt: new Date()
      },
      {
        id: "2",
        amountEur: 50,
        type: "income",
        status: "scheduled",
        periodLabel: "Jul",
        paidAt: null
      },
      {
        id: "3",
        amountEur: 25,
        type: "return_of_capital",
        status: "paid",
        periodLabel: null,
        paidAt: new Date()
      }
    ]);
    expect(total).toBe(100);
  });
});

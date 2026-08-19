import { describe, expect, it } from "vitest";
import {
  INVESTORS_PAGE_SIZE,
  paginateRows,
  searchInvestorRows
} from "@/lib/investors/list-search";
import type { InvestorRow } from "@/lib/investors/queries";

function row(partial: Partial<InvestorRow> & { id: string }): InvestorRow {
  return {
    email: `${partial.id}@example.com`,
    fullName: "",
    accountStatus: "active",
    poolInvestmentsEnabled: false,
    kycStatus: "not_started",
    applicationStatus: null,
    applicationCreatedAt: null,
    assignedAgentId: null,
    assignedAgentEmail: null,
    ibId: null,
    ibEmail: null,
    ...partial
  };
}

describe("searchInvestorRows", () => {
  const rows = [
    row({ id: "1", email: "ada@example.com", fullName: "Ada Lovelace" }),
    row({ id: "2", email: "grace@example.com", fullName: "Grace Hopper" }),
    row({ id: "3", email: "alan@example.com", fullName: "Alan Turing" })
  ];

  it("matches case-insensitive substrings of email and full name", () => {
    expect(searchInvestorRows(rows, "ADA").map((r) => r.id)).toEqual(["1"]);
    expect(searchInvestorRows(rows, "hopper").map((r) => r.id)).toEqual(["2"]);
    expect(searchInvestorRows(rows, "example.com").map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("returns the input unchanged for a blank search", () => {
    expect(searchInvestorRows(rows, "")).toBe(rows);
    expect(searchInvestorRows(rows, "   ")).toBe(rows);
  });

  it("matches nothing gracefully", () => {
    expect(searchInvestorRows(rows, "zzz")).toEqual([]);
  });
});

describe("paginateRows", () => {
  const rows = Array.from({ length: 60 }, (_, i) => i + 1);

  it("slices 25 per page by default page size", () => {
    const page1 = paginateRows(rows, 1, INVESTORS_PAGE_SIZE);
    expect(page1.rows).toHaveLength(25);
    expect(page1.rows[0]).toBe(1);
    expect(page1.total).toBe(60);
    expect(page1.pageCount).toBe(3);

    const page3 = paginateRows(rows, 3, INVESTORS_PAGE_SIZE);
    expect(page3.rows).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
  });

  it("clamps out-of-range pages", () => {
    expect(paginateRows(rows, 99, INVESTORS_PAGE_SIZE).page).toBe(3);
    expect(paginateRows(rows, 99, INVESTORS_PAGE_SIZE).rows).toHaveLength(10);
    expect(paginateRows(rows, 0, INVESTORS_PAGE_SIZE).page).toBe(1);
  });

  it("reports one empty page for an empty list", () => {
    const result = paginateRows([] as number[], 1, INVESTORS_PAGE_SIZE);
    expect(result).toEqual({ rows: [], total: 0, page: 1, pageCount: 1 });
  });
});

import { describe, expect, it } from "vitest";
import { isStaleLead, STALE_AFTER_DAYS } from "@/lib/leads/stale";

const NOW = new Date("2026-07-23T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("isStaleLead", () => {
  it("flags a non-terminal lead whose last activity is older than 7 days", () => {
    expect(isStaleLead({ status: "contacted", lastActivityAt: daysAgo(8) }, NOW)).toBe(true);
    expect(isStaleLead({ status: "new", lastActivityAt: daysAgo(8) }, NOW)).toBe(true);
    expect(isStaleLead({ status: "qualified", lastActivityAt: daysAgo(8) }, NOW)).toBe(true);
  });

  it("does not flag activity 7 days old or newer", () => {
    expect(isStaleLead({ status: "contacted", lastActivityAt: daysAgo(7) }, NOW)).toBe(false);
    expect(isStaleLead({ status: "contacted", lastActivityAt: daysAgo(1) }, NOW)).toBe(false);
  });

  it("never flags terminal stages", () => {
    for (const status of ["unqualified", "duplicate", "converted"]) {
      expect(isStaleLead({ status, lastActivityAt: daysAgo(30) }, NOW)).toBe(false);
    }
  });

  it("does not flag a lead with no recorded activity", () => {
    expect(isStaleLead({ status: "new", lastActivityAt: null }, NOW)).toBe(false);
  });

  it("exports a 7-day threshold", () => {
    expect(STALE_AFTER_DAYS).toBe(7);
  });
});

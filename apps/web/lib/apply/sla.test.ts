import { describe, expect, it } from "vitest";
import {
  APPLICATION_SLA_HOURS,
  formatApplicationAge,
  isApplicationOverSla
} from "@/lib/apply/sla";

describe("application SLA helpers", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");

  it("formats sub-day age in hours", () => {
    const created = new Date("2026-07-19T06:00:00.000Z");
    expect(formatApplicationAge(created, now)).toBe("6h");
  });

  it("flags overdue after SLA hours", () => {
    const created = new Date(now.getTime() - (APPLICATION_SLA_HOURS + 1) * 3600_000);
    expect(isApplicationOverSla(created, now)).toBe(true);
  });

  it("does not flag fresh applications", () => {
    const created = new Date(now.getTime() - 12 * 3600_000);
    expect(isApplicationOverSla(created, now)).toBe(false);
  });
});

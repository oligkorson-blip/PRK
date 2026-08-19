import { describe, expect, it } from "vitest";
import { startOfUtcDay } from "@/lib/interests/rate-limit";

describe("startOfUtcDay", () => {
  it("truncates to UTC midnight", () => {
    expect(startOfUtcDay(new Date("2026-07-18T23:59:59.999Z")).toISOString()).toBe(
      "2026-07-18T00:00:00.000Z"
    );
  });

  it("is idempotent just after midnight", () => {
    expect(startOfUtcDay(new Date("2026-07-18T00:00:00.001Z")).toISOString()).toBe(
      "2026-07-18T00:00:00.000Z"
    );
  });

  it("does not roll over to the previous day", () => {
    expect(startOfUtcDay(new Date("2026-01-01T00:00:00.000Z")).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });
});

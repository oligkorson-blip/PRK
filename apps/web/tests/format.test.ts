import { describe, expect, it } from "vitest";
import { formatDateDdMmYyyy, formatDateTimeUtc, formatEur, formatYieldPct } from "@/lib/format";

describe("formatEur", () => {
  it("formats whole euros with en-IE currency", () => {
    expect(formatEur(9900)).toBe("€9,900");
  });
});

describe("formatYieldPct", () => {
  it("formats one decimal with percent sign", () => {
    expect(formatYieldPct(7.7)).toBe("7.7%");
    expect(formatYieldPct("8.40")).toBe("8.4%");
  });
});

describe("formatDateDdMmYyyy", () => {
  it("formats ISO date strings as DD-MM-YYYY", () => {
    expect(formatDateDdMmYyyy("2026-07-19")).toBe("19-07-2026");
    expect(formatDateDdMmYyyy("2026-04-14T12:00:00.000Z")).toBe("14-04-2026");
  });

  it("formats Date values with the UTC calendar day", () => {
    expect(formatDateDdMmYyyy(new Date("2026-07-03T00:00:00.000Z"))).toBe("03-07-2026");
  });
});

describe("formatDateTimeUtc", () => {
  it("formats UTC date-time stamps", () => {
    expect(formatDateTimeUtc(new Date("2026-07-24T19:32:07.000Z"))).toBe(
      "24-07-2026 19:32:07 UTC"
    );
  });
});

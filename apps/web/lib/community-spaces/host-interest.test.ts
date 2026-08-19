import { describe, expect, it } from "vitest";
import {
  formatHostInterestNotes,
  validateHostInterest
} from "./host-interest";

function submission(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    fullName: "  Alex\nHost  ",
    email: "HOST@example.com",
    phone: "+357 99 123456",
    spaceType: "garage",
    city: "Limassol",
    district: "Old Town",
    country: "Cyprus",
    availability: "Weekdays",
    monthlyPriceEur: "125",
    notes: "Covered and gated",
    privacyAccepted: "on",
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe("community host interest", () => {
  it("normalizes and validates a complete submission", () => {
    const result = validateHostInterest(submission());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.fullName).toBe("Alex Host");
    expect(result.data.email).toBe("host@example.com");
    expect(result.data.monthlyPriceEur).toBe(125);
    expect(formatHostInterestNotes(result.data)).toContain(
      "General location: Old Town, Limassol, Cyprus"
    );
  });

  it("requires privacy consent", () => {
    const result = validateHostInterest(submission({ privacyAccepted: "" }));
    expect(result).toEqual({
      ok: false,
      error: "Confirm that you have read the privacy notice."
    });
  });

  it("rejects unknown space types", () => {
    const result = validateHostInterest(submission({ spaceType: "warehouse" }));
    expect(result).toEqual({
      ok: false,
      error: "Choose a valid parking-space type."
    });
  });

  it.each(["0", "-1", "10001", "12.5"])(
    "rejects invalid indicative price %s",
    (monthlyPriceEur) => {
      const result = validateHostInterest(submission({ monthlyPriceEur }));
      expect(result).toEqual({
        ok: false,
        error: "Enter an indicative monthly price between €1 and €10,000."
      });
    }
  );

  it("allows the indicative price to be omitted", () => {
    const result = validateHostInterest(submission({ monthlyPriceEur: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.monthlyPriceEur).toBeNull();
  });
});

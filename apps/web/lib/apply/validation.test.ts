import { describe, expect, it } from "vitest";
import {
  APPLICATION_COUNTRIES,
  APPLICATION_TICKET_BANDS,
  validateApplicationInput
} from "@/lib/apply/validation";

describe("validateApplicationInput", () => {
  const base = {
    accountType: "individual" as const,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "+353 1 000",
    countryOfResidence: "Ireland",
    termsAccepted: true,
    riskAccepted: true
  };

  it("accepts a valid individual application", () => {
    expect(validateApplicationInput(base).ok).toBe(true);
  });

  it("accepts a valid company application", () => {
    const result = validateApplicationInput({
      ...base,
      accountType: "company",
      companyLegalName: "Lovelace Holdings Ltd",
      countryOfIncorporation: "Ireland"
    });
    expect(result.ok).toBe(true);
  });

  it("requires company fields for company accounts", () => {
    const result = validateApplicationInput({
      ...base,
      accountType: "company"
    });
    expect(result.ok).toBe(false);
  });

  it("requires terms and risk", () => {
    const result = validateApplicationInput({ ...base, termsAccepted: false });
    expect(result.ok).toBe(false);
  });

  it("rejects emails without a domain", () => {
    const result = validateApplicationInput({ ...base, email: "ada@" });
    expect(result.ok).toBe(false);
  });

  it("accepts names at the 100-character cap", () => {
    const result = validateApplicationInput({ ...base, firstName: "A".repeat(100) });
    expect(result.ok).toBe(true);
  });

  it("rejects names over 100 characters", () => {
    expect(validateApplicationInput({ ...base, firstName: "A".repeat(101) }).ok).toBe(false);
    expect(validateApplicationInput({ ...base, lastName: "B".repeat(101) }).ok).toBe(false);
  });

  it("rejects emails over 254 characters", () => {
    const email = `${"a".repeat(243)}@example.com`; // 255 chars total
    expect(email.length).toBe(255);
    expect(validateApplicationInput({ ...base, email }).ok).toBe(false);
  });

  it("rejects phone numbers over 40 characters", () => {
    expect(validateApplicationInput({ ...base, phone: "+1 ".concat("5".repeat(40)) }).ok).toBe(
      false
    );
    expect(validateApplicationInput({ ...base, phone: "+353 ".concat("5".repeat(35)) }).ok).toBe(
      true
    );
  });

  it("rejects a country of residence outside the wizard list", () => {
    const result = validateApplicationInput({ ...base, countryOfResidence: "Atlantis" });
    expect(result.ok).toBe(false);
  });

  it("accepts every country offered by the wizard", () => {
    for (const countryOfResidence of APPLICATION_COUNTRIES) {
      expect(validateApplicationInput({ ...base, countryOfResidence }).ok).toBe(true);
    }
  });

  it("accepts every ticket band offered by the wizard", () => {
    for (const ticketBand of APPLICATION_TICKET_BANDS) {
      expect(validateApplicationInput({ ...base, ticketBand }).ok).toBe(true);
    }
  });

  it("rejects a ticket band the wizard does not offer", () => {
    expect(validateApplicationInput({ ...base, ticketBand: "1m+" }).ok).toBe(false);
  });

  it("still accepts applications with no ticket band", () => {
    expect(validateApplicationInput({ ...base, ticketBand: undefined }).ok).toBe(true);
  });

  it("rejects company legal names over 200 characters", () => {
    const result = validateApplicationInput({
      ...base,
      accountType: "company",
      companyLegalName: "C".repeat(201),
      countryOfIncorporation: "Ireland"
    });
    expect(result.ok).toBe(false);
  });

  it("rejects countries of incorporation over 100 characters", () => {
    const result = validateApplicationInput({
      ...base,
      accountType: "company",
      companyLegalName: "Lovelace Holdings Ltd",
      countryOfIncorporation: "D".repeat(101)
    });
    expect(result.ok).toBe(false);
  });

  it("keeps the 500-character goals note boundary", () => {
    expect(validateApplicationInput({ ...base, goalsNote: "g".repeat(500) }).ok).toBe(true);
    expect(validateApplicationInput({ ...base, goalsNote: "g".repeat(501) }).ok).toBe(false);
  });
});

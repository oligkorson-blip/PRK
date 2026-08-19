import { describe, expect, it } from "vitest";
import { onboardingFormDataToInput, onboardingFormSchema, onboardingProfileSchema } from "@/lib/onboarding/schema";

function yearsAgo(years: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

const validInput = {
  accountType: "individual",
  fullName: "Jane Investor",
  country: "Ireland",
  phone: "+353 1 234 5678",
  dateOfBirth: "1985-04-12",
  address: "12 Harbour Road, Sligo",
  nationality: "Irish",
  pepDeclaration: false,
  investmentHorizon: "5-10",
  sourceOfFunds: "Employment income and prior investment proceeds.",
  isQualifyingInvestor: true,
  understandsCapitalAtRisk: true,
  acceptTerms: true,
  acceptRisk: true
};

const validCompanyInput = {
  accountType: "company",
  fullName: "Jane Director",
  country: "Ireland",
  phone: "",
  companyLegalName: "Harbour Holdings Ltd",
  countryOfIncorporation: "Ireland",
  companyNumber: "IE 123456",
  address: "12 Harbour Road, Sligo",
  pepDeclaration: false,
  investmentHorizon: "5-10",
  sourceOfFunds: "Company operating profits.",
  isQualifyingInvestor: true,
  understandsCapitalAtRisk: true,
  acceptTerms: true,
  acceptRisk: true
};

describe("onboardingFormSchema", () => {
  it("accepts a fully valid submission", () => {
    expect(onboardingFormSchema.safeParse(validInput).success).toBe(true);
  });

  it("accepts a positive PEP declaration", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, pepDeclaration: true }).success).toBe(true);
  });

  it("allows phone to be omitted or empty", () => {
    const { phone, ...rest } = validInput;
    expect(onboardingFormSchema.safeParse(rest).success).toBe(true);
    expect(onboardingFormSchema.safeParse({ ...validInput, phone: "" }).success).toBe(true);
  });

  it("rejects a malformed date of birth", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, dateOfBirth: "12/04/1985" }).success).toBe(false);
    expect(onboardingFormSchema.safeParse({ ...validInput, dateOfBirth: "" }).success).toBe(false);
  });

  it("rejects an invalid calendar date of birth", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, dateOfBirth: "1985-13-01" }).success).toBe(false);
    expect(onboardingFormSchema.safeParse({ ...validInput, dateOfBirth: "1985-02-31" }).success).toBe(false);
  });

  it("rejects a date of birth in the future or before 1900", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, dateOfBirth: "2999-01-01" }).success).toBe(false);
    expect(onboardingFormSchema.safeParse({ ...validInput, dateOfBirth: "1899-12-31" }).success).toBe(false);
  });

  it("rejects applicants under 18", () => {
    const result = onboardingFormSchema.safeParse({ ...validInput, dateOfBirth: yearsAgo(17) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "You must be at least 18 years old."
      );
    }
  });

  it("accepts an applicant who turned 18 today", () => {
    expect(
      onboardingFormSchema.safeParse({ ...validInput, dateOfBirth: yearsAgo(18) }).success
    ).toBe(true);
  });

  it("rejects a country of residence outside the application country list", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, country: "Switzerland" }).success).toBe(true);
    expect(onboardingFormSchema.safeParse({ ...validInput, country: "Atlantis" }).success).toBe(false);
  });

  it("rejects an address shorter than 5 or longer than 300 characters", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, address: "Apt" }).success).toBe(false);
    expect(onboardingFormSchema.safeParse({ ...validInput, address: "x".repeat(301) }).success).toBe(false);
  });

  it("rejects a nationality shorter than 2 characters", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, nationality: "I" }).success).toBe(false);
  });

  it("rejects a missing PEP declaration", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, pepDeclaration: null }).success).toBe(false);
    const { pepDeclaration, ...rest } = validInput;
    expect(onboardingFormSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects fullName shorter than 2 characters", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, fullName: "J" }).success).toBe(false);
  });

  it("rejects an invalid investmentHorizon value", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, investmentHorizon: "1-3" }).success).toBe(false);
  });

  it("rejects sourceOfFunds over 200 characters", () => {
    expect(
      onboardingFormSchema.safeParse({ ...validInput, sourceOfFunds: "x".repeat(201) }).success
    ).toBe(false);
  });

  it("rejects sourceOfFunds shorter than 2 characters", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, sourceOfFunds: "x" }).success).toBe(false);
  });

  it("rejects when isQualifyingInvestor is false", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, isQualifyingInvestor: false }).success).toBe(false);
  });

  it("rejects when understandsCapitalAtRisk is false", () => {
    expect(
      onboardingFormSchema.safeParse({ ...validInput, understandsCapitalAtRisk: false }).success
    ).toBe(false);
  });

  it("rejects when acceptTerms is false", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, acceptTerms: false }).success).toBe(false);
  });

  it("rejects when acceptRisk is false", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, acceptRisk: false }).success).toBe(false);
  });

  it("rejects an unknown accountType", () => {
    expect(onboardingFormSchema.safeParse({ ...validInput, accountType: "trust" }).success).toBe(false);
  });
});

describe("onboardingFormSchema (company)", () => {
  it("accepts a company submission with no date of birth or nationality", () => {
    expect(onboardingFormSchema.safeParse(validCompanyInput).success).toBe(true);
  });

  it("requires the company legal name", () => {
    const { companyLegalName, ...rest } = validCompanyInput;
    expect(onboardingFormSchema.safeParse(rest).success).toBe(false);
    expect(onboardingFormSchema.safeParse({ ...validCompanyInput, companyLegalName: "J" }).success).toBe(false);
  });

  it("requires the company registration number", () => {
    const { companyNumber, ...rest } = validCompanyInput;
    expect(onboardingFormSchema.safeParse(rest).success).toBe(false);
    expect(onboardingFormSchema.safeParse({ ...validCompanyInput, companyNumber: "" }).success).toBe(false);
  });

  it("requires a registered address", () => {
    expect(onboardingFormSchema.safeParse({ ...validCompanyInput, address: "" }).success).toBe(false);
  });

  it("requires a country of incorporation from the application country list", () => {
    const { countryOfIncorporation, ...rest } = validCompanyInput;
    expect(onboardingFormSchema.safeParse(rest).success).toBe(false);
    expect(
      onboardingFormSchema.safeParse({ ...validCompanyInput, countryOfIncorporation: "Switzerland" })
        .success
    ).toBe(true);
  });

  it("still enforces the shared declarations and suitability fields", () => {
    expect(onboardingFormSchema.safeParse({ ...validCompanyInput, acceptRisk: false }).success).toBe(false);
    expect(onboardingFormSchema.safeParse({ ...validCompanyInput, pepDeclaration: null }).success).toBe(false);
    expect(
      onboardingFormSchema.safeParse({ ...validCompanyInput, investmentHorizon: "1-3" }).success
    ).toBe(false);
  });
});

describe("onboardingFormDataToInput", () => {
  it("coerces checked checkboxes to true and unchecked to false", () => {
    const formData = new FormData();
    formData.set("fullName", "Jane Investor");
    formData.set("country", "Ireland");
    formData.set("investmentHorizon", "3-5");
    formData.set("sourceOfFunds", "Savings");
    formData.set("isQualifyingInvestor", "on");
    formData.set("acceptTerms", "on");
    // understandsCapitalAtRisk and acceptRisk intentionally omitted (unchecked)

    const result = onboardingFormDataToInput(formData) as Record<string, unknown>;
    expect(result.isQualifyingInvestor).toBe(true);
    expect(result.acceptTerms).toBe(true);
    expect(result.understandsCapitalAtRisk).toBe(false);
    expect(result.acceptRisk).toBe(false);

    expect(onboardingFormSchema.safeParse(result).success).toBe(false);
  });

  it("maps the PEP radio group to a boolean and leaves no selection as null", () => {
    const formData = new FormData();
    formData.set("pepDeclaration", "yes");
    expect((onboardingFormDataToInput(formData) as Record<string, unknown>).pepDeclaration).toBe(true);

    formData.set("pepDeclaration", "no");
    expect((onboardingFormDataToInput(formData) as Record<string, unknown>).pepDeclaration).toBe(false);

    const empty = new FormData();
    expect((onboardingFormDataToInput(empty) as Record<string, unknown>).pepDeclaration).toBe(null);
  });

  it("produces a schema-valid shape when all fields are filled and boxes checked", () => {
    const formData = new FormData();
    formData.set("fullName", "Jane Investor");
    formData.set("country", "Ireland");
    formData.set("phone", "+353 1 234 5678");
    formData.set("dateOfBirth", "1985-04-12");
    formData.set("address", "12 Harbour Road, Sligo");
    formData.set("nationality", "Irish");
    formData.set("pepDeclaration", "no");
    formData.set("investmentHorizon", "10+");
    formData.set("sourceOfFunds", "Business sale proceeds");
    formData.set("isQualifyingInvestor", "on");
    formData.set("understandsCapitalAtRisk", "on");
    formData.set("acceptTerms", "on");
    formData.set("acceptRisk", "on");

    const result = onboardingFormDataToInput(formData, "individual");
    expect(onboardingFormSchema.safeParse(result).success).toBe(true);
  });

  it("produces a schema-valid company shape without personal fields", () => {
    const formData = new FormData();
    formData.set("fullName", "Jane Director");
    formData.set("country", "Ireland");
    formData.set("companyLegalName", "Harbour Holdings Ltd");
    formData.set("countryOfIncorporation", "Ireland");
    formData.set("companyNumber", "IE 123456");
    formData.set("address", "12 Harbour Road, Sligo");
    formData.set("pepDeclaration", "no");
    formData.set("investmentHorizon", "10+");
    formData.set("sourceOfFunds", "Company operating profits.");
    formData.set("isQualifyingInvestor", "on");
    formData.set("understandsCapitalAtRisk", "on");
    formData.set("acceptTerms", "on");
    formData.set("acceptRisk", "on");

    const result = onboardingFormDataToInput(formData, "company");
    expect(onboardingFormSchema.safeParse(result).success).toBe(true);
  });
});

describe("onboardingProfileSchema", () => {
  const validProfile = {
    accountType: "individual",
    fullName: "Jane Investor",
    country: "Ireland",
    phone: "+353 1 234 5678",
    dateOfBirth: "1985-04-12",
    address: "12 Harbour Road, Sligo",
    nationality: "Irish",
    pepDeclaration: false,
    investmentHorizon: "5-10",
    sourceOfFunds: "Employment income and prior investment proceeds."
  };

  it("accepts a valid profile without declaration fields", () => {
    expect(onboardingProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("accepts a blank phone", () => {
    expect(onboardingProfileSchema.safeParse({ ...validProfile, phone: "" }).success).toBe(true);
  });

  it("rejects an incomplete profile", () => {
    expect(onboardingProfileSchema.safeParse({ ...validProfile, dateOfBirth: "" }).success).toBe(false);
    expect(onboardingProfileSchema.safeParse({ ...validProfile, pepDeclaration: null }).success).toBe(false);
    expect(onboardingProfileSchema.safeParse({ ...validProfile, investmentHorizon: "1-3" }).success).toBe(false);
  });

  it("rejects an individual profile for an under-18 applicant", () => {
    expect(
      onboardingProfileSchema.safeParse({ ...validProfile, dateOfBirth: yearsAgo(16) }).success
    ).toBe(false);
  });

  it("rejects an individual profile with a country outside the list", () => {
    expect(onboardingProfileSchema.safeParse({ ...validProfile, country: "Switzerland" }).success).toBe(true);
    expect(onboardingProfileSchema.safeParse({ ...validProfile, country: "Atlantis" }).success).toBe(false);
  });

  it("accepts a company profile without date of birth or nationality", () => {
    const companyProfile = {
      accountType: "company",
      fullName: "Jane Director",
      country: "Ireland",
      phone: "",
      companyLegalName: "Harbour Holdings Ltd",
      countryOfIncorporation: "Ireland",
      companyNumber: "IE 123456",
      address: "12 Harbour Road, Sligo",
      pepDeclaration: false,
      investmentHorizon: "5-10",
      sourceOfFunds: "Company operating profits."
    };
    expect(onboardingProfileSchema.safeParse(companyProfile).success).toBe(true);
    expect(
      onboardingProfileSchema.safeParse({ ...companyProfile, companyNumber: "" }).success
    ).toBe(false);
  });
});

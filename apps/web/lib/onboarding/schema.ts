import { z } from "zod";
import { APPLICATION_COUNTRIES } from "@/lib/apply/validation";

export const investmentHorizonOptions = ["3-5", "5-10", "10+"] as const;

// Same 8-option list as the apply wizard — onboarding never accepts a
// jurisdiction the application stage would have rejected.
export const onboardingCountryOptions = APPLICATION_COUNTRIES;

const countrySchema = z.enum(APPLICATION_COUNTRIES, {
  message: "Select your country from the list."
});

const dobSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return false;
    // Day overflow (e.g. Feb 31) silently rolls into the next month — the
    // round-trip must reproduce the input for the date to be real.
    if (date.toISOString().slice(0, 10) !== value) return false;
    return date.getTime() >= Date.UTC(1900, 0, 1) && date.getTime() <= Date.now();
  }, "Enter a valid date of birth.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
    // The DOB is a midnight UTC instant, the cutoff is "now" 18 years ago —
    // an applicant who turns 18 today passes.
    return date.getTime() <= cutoff.getTime();
  }, "You must be at least 18 years old.");

const sharedProfileFields = {
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  pepDeclaration: z.boolean({
    invalid_type_error: "Confirm whether you are a politically exposed person."
  }),
  investmentHorizon: z.enum(investmentHorizonOptions),
  sourceOfFunds: z.string().trim().min(2).max(200)
};

const individualProfileShape = {
  accountType: z.literal("individual"),
  fullName: z.string().trim().min(2).max(120),
  country: countrySchema,
  dateOfBirth: dobSchema,
  address: z.string().trim().min(5).max(300),
  nationality: z.string().trim().min(2).max(80),
  ...sharedProfileFields
};

// Companies have no DOB/nationality; instead they prove the entity: legal
// name, incorporation country, registration number and registered address
// (stored in the same `address` column).
const companyProfileShape = {
  accountType: z.literal("company"),
  fullName: z.string().trim().min(2).max(120),
  country: countrySchema,
  companyLegalName: z.string().trim().min(2).max(200),
  countryOfIncorporation: countrySchema,
  companyNumber: z.string().trim().min(2).max(50),
  address: z.string().trim().min(5).max(300),
  ...sharedProfileFields
};

// Profile-only shapes used by the staff-assisted actions. The full schema's
// declaration literals (acceptTerms/acceptRisk/isQualifyingInvestor/
// understandsCapitalAtRisk) are form checkboxes, not stored columns, so they
// can't be validated from the investors row — assistedAcceptDeclarations
// validates this profile shape against stored data instead.
export const onboardingProfileSchema = z.discriminatedUnion("accountType", [
  z.object(individualProfileShape),
  z.object(companyProfileShape)
]);

export type OnboardingProfileInput = z.infer<typeof onboardingProfileSchema>;

const declarationFields = {
  isQualifyingInvestor: z.literal(true),
  understandsCapitalAtRisk: z.literal(true),
  acceptTerms: z.literal(true),
  acceptRisk: z.literal(true)
};

export const onboardingFormSchema = z.discriminatedUnion("accountType", [
  z.object({ ...individualProfileShape, ...declarationFields }),
  z.object({ ...companyProfileShape, ...declarationFields })
]);

export type OnboardingFormInput = z.infer<typeof onboardingFormSchema>;

// Checkboxes only appear in FormData when checked ("on"), so a missing
// entry must be coerced to `false` rather than left `undefined` for Zod's
// literal(true) checks to fail correctly instead of just being optional.
// The PEP declaration is a yes/no radio group: map to a real boolean and
// leave `null` (no selection) for Zod to reject.
//
// `accountType` comes from the server-side investor row, never from the
// posted form — a tampered hidden field can't switch an individual onto the
// company (no-DOB) path.
export function onboardingFormDataToInput(
  formData: FormData,
  accountType: "individual" | "company" = "individual"
): unknown {
  const pep = formData.get("pepDeclaration");
  const base = {
    accountType,
    fullName: formData.get("fullName") ?? "",
    country: formData.get("country") ?? "",
    phone: formData.get("phone") ?? "",
    address: formData.get("address") ?? "",
    pepDeclaration: pep === "yes" ? true : pep === "no" ? false : null,
    investmentHorizon: formData.get("investmentHorizon") ?? "",
    sourceOfFunds: formData.get("sourceOfFunds") ?? "",
    isQualifyingInvestor: formData.get("isQualifyingInvestor") === "on",
    understandsCapitalAtRisk: formData.get("understandsCapitalAtRisk") === "on",
    acceptTerms: formData.get("acceptTerms") === "on",
    acceptRisk: formData.get("acceptRisk") === "on"
  };
  if (accountType === "company") {
    return {
      ...base,
      companyLegalName: formData.get("companyLegalName") ?? "",
      countryOfIncorporation: formData.get("countryOfIncorporation") ?? "",
      companyNumber: formData.get("companyNumber") ?? ""
    };
  }
  return {
    ...base,
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    nationality: formData.get("nationality") ?? ""
  };
}

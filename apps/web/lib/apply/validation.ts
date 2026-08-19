export type ApplicationInput = {
  accountType: "individual" | "company";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  countryOfResidence: string;
  companyLegalName?: string;
  countryOfIncorporation?: string;
  ticketBand?: string;
  goalsNote?: string;
  opportunitySlug?: string;
  opportunityOption?: string;
  termsAccepted: boolean;
  riskAccepted: boolean;
};

/**
 * Options offered by components/apply-wizard.tsx — the wizard imports these so
 * the client and server never drift apart.
 */
export const APPLICATION_COUNTRIES = [
  "Ireland",
  "Austria",
  "France",
  "Germany",
  "Netherlands",
  "Belgium",
  "Spain",
  "Italy",
  "Switzerland",
  "Other EU"
] as const;

export const APPLICATION_TICKET_BANDS = ["5-25k", "25-100k", "100k+"] as const;

export function validateApplicationInput(
  input: ApplicationInput
): { ok: true; data: ApplicationInput } | { ok: false; error: string } {
  if (input.accountType !== "individual" && input.accountType !== "company") {
    return { ok: false, error: "Select Individual or Company." };
  }
  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const phone = input.phone?.trim() ?? "";
  const country = input.countryOfResidence?.trim() ?? "";
  const companyLegalName = input.companyLegalName?.trim() ?? "";
  const countryOfIncorporation = input.countryOfIncorporation?.trim() ?? "";

  if (!firstName || !lastName) return { ok: false, error: "Enter your first and last name." };
  if (firstName.length > 100 || lastName.length > 100) {
    return { ok: false, error: "First and last names must be 100 characters or fewer." };
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (!phone) return { ok: false, error: "Enter a phone number." };
  if (phone.length > 40) {
    return { ok: false, error: "Phone number must be 40 characters or fewer." };
  }
  if (!country) return { ok: false, error: "Enter your country of residence." };
  if (!(APPLICATION_COUNTRIES as readonly string[]).includes(country)) {
    return { ok: false, error: "Select your country of residence from the list." };
  }
  if (!input.termsAccepted || !input.riskAccepted) {
    return { ok: false, error: "Accept Terms and Risk Disclosure to continue." };
  }

  if (input.accountType === "company") {
    if (!companyLegalName) {
      return { ok: false, error: "Enter the company legal name." };
    }
    if (companyLegalName.length > 200) {
      return { ok: false, error: "Company legal name must be 200 characters or fewer." };
    }
    if (!countryOfIncorporation) {
      return { ok: false, error: "Enter the country of incorporation." };
    }
    if (!(APPLICATION_COUNTRIES as readonly string[]).includes(countryOfIncorporation)) {
      return { ok: false, error: "Select the country of incorporation from the list." };
    }
  }

  if (
    input.ticketBand &&
    !(APPLICATION_TICKET_BANDS as readonly string[]).includes(input.ticketBand)
  ) {
    return { ok: false, error: "Select a valid investment amount." };
  }

  if (input.opportunitySlug && !/^[a-z0-9-]{1,120}$/i.test(input.opportunitySlug)) return { ok: false, error: "Invalid opportunity context." };
  if (input.opportunityOption && !/^[a-z0-9_-]{1,80}$/i.test(input.opportunityOption)) return { ok: false, error: "Invalid opportunity option." };

  if (input.goalsNote && input.goalsNote.length > 500) {
    return { ok: false, error: "Goals note must be 500 characters or fewer." };
  }

  return {
    ok: true,
    data: {
      ...input,
      firstName,
      lastName,
      email,
      phone,
      countryOfResidence: country,
      companyLegalName: companyLegalName || undefined,
      countryOfIncorporation: countryOfIncorporation || undefined,
      goalsNote: input.goalsNote?.trim() || undefined
    }
  };
}

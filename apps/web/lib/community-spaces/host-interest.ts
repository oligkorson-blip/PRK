import {
  COMMUNITY_SPACE_TYPES,
  communitySpaceTypeLabel,
  type CommunitySpaceType
} from "./types";

export type HostInterestInput = {
  fullName: string;
  email: string;
  phone: string;
  spaceType: CommunitySpaceType;
  city: string;
  district: string;
  country: string;
  availability: string;
  monthlyPriceEur: number | null;
  notes: string;
};

export type HostInterestValidation =
  | { ok: true; data: HostInterestInput }
  | { ok: false; error: string };

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function singleLine(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F-\x9F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noteText(value: string): string {
  return value.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "").trim();
}

export function validateHostInterest(formData: FormData): HostInterestValidation {
  const fullName = singleLine(formText(formData, "fullName"));
  const email = singleLine(formText(formData, "email")).toLowerCase();
  const phone = singleLine(formText(formData, "phone"));
  const rawSpaceType = singleLine(formText(formData, "spaceType"));
  const city = singleLine(formText(formData, "city"));
  const district = singleLine(formText(formData, "district"));
  const country = singleLine(formText(formData, "country"));
  const availability = singleLine(formText(formData, "availability"));
  const rawMonthlyPrice = singleLine(formText(formData, "monthlyPriceEur"));
  const notes = noteText(formText(formData, "notes"));

  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, error: "Enter your full name." };
  }
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (phone.length < 5 || phone.length > 40) {
    return { ok: false, error: "Enter a phone number we can use to contact you." };
  }
  if (!COMMUNITY_SPACE_TYPES.some((type) => type === rawSpaceType)) {
    return { ok: false, error: "Choose a valid parking-space type." };
  }
  if (city.length < 2 || city.length > 80 || country.length < 2 || country.length > 80) {
    return { ok: false, error: "Enter the city and country where the space is located." };
  }
  if (district.length > 100) {
    return { ok: false, error: "Keep the district or area under 100 characters." };
  }
  if (availability.length > 160) {
    return { ok: false, error: "Keep availability details under 160 characters." };
  }
  if (notes.length > 500) {
    return { ok: false, error: "Keep additional details under 500 characters." };
  }
  if (formData.get("privacyAccepted") !== "on") {
    return { ok: false, error: "Confirm that you have read the privacy notice." };
  }

  let monthlyPriceEur: number | null = null;
  if (rawMonthlyPrice) {
    monthlyPriceEur = Number(rawMonthlyPrice);
    if (
      !Number.isInteger(monthlyPriceEur) ||
      monthlyPriceEur <= 0 ||
      monthlyPriceEur > 10_000
    ) {
      return {
        ok: false,
        error: "Enter an indicative monthly price between €1 and €10,000."
      };
    }
  }

  return {
    ok: true,
    data: {
      fullName,
      email,
      phone,
      spaceType: rawSpaceType as CommunitySpaceType,
      city,
      district,
      country,
      availability,
      monthlyPriceEur,
      notes
    }
  };
}

export function formatHostInterestNotes(input: HostInterestInput): string {
  const location = [input.district, input.city, input.country].filter(Boolean).join(", ");
  return [
    `Space type: ${communitySpaceTypeLabel(input.spaceType)}`,
    `General location: ${location}`,
    input.availability ? `Availability: ${input.availability}` : null,
    input.monthlyPriceEur
      ? `Indicative monthly price: €${input.monthlyPriceEur}`
      : null,
    input.notes ? `Host details: ${input.notes}` : null,
    "Submitted through /list-a-space; privacy consent confirmed."
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

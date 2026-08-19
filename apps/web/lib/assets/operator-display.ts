export type OperatorDisplayMode = "named" | "pattern";

export type OperatorDisplay = {
  mode: OperatorDisplayMode;
  /** Public kicker shown on cards/detail */
  label: string;
  /** Real legal/ops name — ops only when mode is pattern */
  legalName?: string;
};

const COUNTRY_PATTERN: Record<string, string> = {
  France: "National parking operator · France",
  Spain: "National parking operator · Spain",
  Belgium: "National parking operator · Belgium",
  Germany: "National parking operator · Germany",
  Austria: "National parking operator · Austria",
  Switzerland: "National parking operator · Switzerland",
  Italy: "National parking operator · Italy",
  Ireland: "National parking operator · Ireland"
};

/** Policy A default: pattern label for public surfaces. */
export function patternOperatorDisplay(country: string, legalName: string): OperatorDisplay {
  return {
    mode: "pattern",
    label: COUNTRY_PATTERN[country] ?? `National parking operator · ${country}`,
    legalName
  };
}

export function publicOperatorLabel(display: OperatorDisplay | null | undefined, fallback: string): string {
  if (display?.label) return display.label;
  return fallback;
}

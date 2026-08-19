/**
 * Seed / template narratives for opportunity detail.
 * Used by seed to fill nullable story columns — not verified claims.
 */

export type OpportunityStories = {
  placeStory: string;
  operatorStory: string;
  demandStory: string;
  numbersNote: string;
};

export type StorySeedInput = {
  name: string;
  city: string;
  country: string;
  siteType?: string | null;
  /** Public-facing operator label (pattern or named). */
  publicOperatorLabel: string;
  /** Must never appear in output — pattern-mode legal names stay ops-only. */
  legalName?: string | null;
};

const NUMBERS_NOTE =
  "Visitor and revenue figures on this page are modelled estimates, not audited accounts. Treat them as scenarios when you weigh the opportunity.";

function placeToken(name: string, city: string): string {
  const trimmed = name.trim();
  // Drop a leading ALL-CAPS brand token when the rest names the place.
  const withoutBrand = trimmed.replace(/^[A-Z0-9]{2,}(?:\s+[A-Z0-9]+)?\s+/, "").trim();
  if (withoutBrand.length >= 4 && withoutBrand !== trimmed) return withoutBrand;
  return trimmed || city;
}

function normalizeType(siteType: string | null | undefined): string {
  return (siteType ?? "").trim().toLowerCase();
}

export function buildOpportunityStories(input: StorySeedInput): OpportunityStories {
  const city = input.city.trim();
  const place = placeToken(input.name, city);
  const operator = input.publicOperatorLabel.trim() || "Parking operator";
  const type = normalizeType(input.siteType);

  let placeStory: string;
  let demandStory: string;

  if (type === "airport") {
    placeStory = `${place} sits beside airport demand in ${city}: short-stay pickups, multi-day trips, and timetable-driven peaks. For travellers it is a familiar stop before and after flights, which is why the location is strategically useful.`;
    demandStory = `Demand here follows passenger schedules more than the office week — outbound mornings, inbound evenings, and holiday surges. Ancillary uses such as EV charging or fleet bays may add small streams, but core income is tied to airport parking behaviour.`;
  } else if (type === "city") {
    placeStory = `${place} is in ${city}'s mixed urban core, where offices, venues, and everyday errands keep kerbside parking scarce. The site is meant to feel like a place residents and visitors already recognise, not a remote logistics yard.`;
    demandStory = `Weekday office and meeting traffic sets the baseline; evenings and weekends pick up from retail, culture, and hospitality nearby. City-centre constraints on on-street parking support contracted off-street demand.`;
  } else if (type === "retail") {
    placeStory = `${place} anchors shopping and leisure trips in ${city}. Footfall around the retail destination makes the car park a practical part of the visit rather than a destination on its own.`;
    demandStory = `Shoppers, cinema and dining guests, and weekend visitors drive occupancy patterns that differ from pure commuter sites. Peak hours track trading hours and events more than the morning rail rush.`;
  } else {
    // station (default)
    placeStory = `${place} serves rail and connecting traffic in ${city}. Stations concentrate familiar daily journeys — commuting, long-distance travel, and onward city trips — so the location is strategically useful as a parking node people already plan around.`;
    demandStory = `Weekday commuters set a steady pattern; leisure and long-distance travellers fill evenings and peaks. Bike storage or EV charging may appear as secondary streams, while contracted vehicle parking remains the primary demand story.`;
  }

  const operatorStory = `${operator} is responsible for day-to-day site management: pricing within the agreed model, local operations, and upkeep of the parking product. The operator runs a multi-site parking estate style of business rather than a single experimental bay, while Parkwise presents the opportunity and investor process.`;

  return {
    placeStory,
    operatorStory,
    demandStory,
    numbersNote: NUMBERS_NOTE
  };
}

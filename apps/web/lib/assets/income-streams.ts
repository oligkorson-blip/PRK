export const INCOME_STREAM_IDS = [
  "vehicle_parking",
  "ev_charging",
  "bicycle_storage",
  "parcel_lockers",
  "car_sharing",
  "micromobility_charging",
  "last_mile_logistics",
  "vehicle_cleaning",
  "fleet_parking"
] as const;

export type IncomeStreamId = (typeof INCOME_STREAM_IDS)[number];

export type IncomeMixEntry = { id: IncomeStreamId; pct: number };

export const INCOME_STREAM_LABELS: Record<IncomeStreamId, string> = {
  vehicle_parking: "Vehicle parking",
  ev_charging: "EV charging",
  bicycle_storage: "Bicycle storage",
  parcel_lockers: "Parcel lockers",
  car_sharing: "Car-sharing spaces",
  micromobility_charging: "Scooter and bicycle charging",
  last_mile_logistics: "Last-mile logistics",
  vehicle_cleaning: "Vehicle cleaning",
  fleet_parking: "Fleet parking"
};

const SHORT_LABELS: Record<IncomeStreamId, string> = {
  vehicle_parking: "Parking",
  ev_charging: "EV",
  bicycle_storage: "Bikes",
  parcel_lockers: "Lockers",
  car_sharing: "Car-share",
  micromobility_charging: "Micro charge",
  last_mile_logistics: "Logistics",
  vehicle_cleaning: "Cleaning",
  fleet_parking: "Fleet"
};

function isIncomeStreamId(id: unknown): id is IncomeStreamId {
  return typeof id === "string" && (INCOME_STREAM_IDS as readonly string[]).includes(id);
}

export function validateIncomeMix(
  mix: unknown
): { ok: true; mix: IncomeMixEntry[] } | { ok: false; error: string } {
  if (!Array.isArray(mix)) {
    return { ok: false, error: "income mix must be an array" };
  }

  const entries: IncomeMixEntry[] = [];
  const seen = new Set<IncomeStreamId>();

  for (const item of mix) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "each entry must be an object" };
    }

    const { id, pct } = item as { id?: unknown; pct?: unknown };

    if (!isIncomeStreamId(id)) {
      return { ok: false, error: "unknown income stream id" };
    }

    if (typeof pct !== "number" || !Number.isFinite(pct) || pct <= 0) {
      return { ok: false, error: "pct must be a positive number" };
    }

    if (seen.has(id)) {
      return { ok: false, error: "duplicate income stream id" };
    }
    seen.add(id);

    entries.push({ id, pct });
  }

  const sum = entries.reduce((acc, entry) => acc + entry.pct, 0);
  if (sum < 99.5 || sum > 100.5) {
    return { ok: false, error: "income mix percentages must sum to 100" };
  }

  const parking = entries.find((entry) => entry.id === "vehicle_parking");
  if (!parking) {
    return { ok: false, error: "vehicle_parking is required" };
  }

  for (const entry of entries) {
    if (entry.id !== "vehicle_parking" && parking.pct < entry.pct) {
      return { ok: false, error: "vehicle_parking must be the largest stream" };
    }
  }

  return { ok: true, mix: entries };
}

export function hasEv(mix: IncomeMixEntry[]): boolean {
  return mix.some((entry) => entry.id === "ev_charging");
}

export function isMultiIncome(mix: IncomeMixEntry[]): boolean {
  return mix.some((entry) => entry.id !== "vehicle_parking");
}

export function formatMixSummary(mix: IncomeMixEntry[]): string {
  return mix.map((entry) => `${SHORT_LABELS[entry.id]} ${entry.pct}%`).join(" · ");
}

import { describe, expect, it } from "vitest";
import {
  validateIncomeMix,
  hasEv,
  isMultiIncome,
  formatMixSummary
} from "@/lib/assets/income-streams";

describe("validateIncomeMix", () => {
  it("accepts parking-only 100", () => {
    const r = validateIncomeMix([{ id: "vehicle_parking", pct: 100 }]);
    expect(r.ok).toBe(true);
  });

  it("accepts parking-dominant multi mix", () => {
    const r = validateIncomeMix([
      { id: "vehicle_parking", pct: 70 },
      { id: "ev_charging", pct: 20 },
      { id: "bicycle_storage", pct: 10 }
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejects missing parking", () => {
    const r = validateIncomeMix([{ id: "ev_charging", pct: 100 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects parking not dominant", () => {
    const r = validateIncomeMix([
      { id: "vehicle_parking", pct: 40 },
      { id: "ev_charging", pct: 60 }
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects bad sum", () => {
    const r = validateIncomeMix([
      { id: "vehicle_parking", pct: 80 },
      { id: "ev_charging", pct: 10 }
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects unknown id", () => {
    const r = validateIncomeMix([{ id: "helicopter_pad", pct: 100 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate stream ids", () => {
    const r = validateIncomeMix([
      { id: "vehicle_parking", pct: 50 },
      { id: "ev_charging", pct: 25 },
      { id: "ev_charging", pct: 25 }
    ]);
    expect(r).toEqual({ ok: false, error: "duplicate income stream id" });
  });
});

describe("helpers", () => {
  const mix = [
    { id: "vehicle_parking" as const, pct: 70 },
    { id: "ev_charging" as const, pct: 30 }
  ];
  it("hasEv / isMultiIncome / formatMixSummary", () => {
    expect(hasEv(mix)).toBe(true);
    expect(isMultiIncome(mix)).toBe(true);
    expect(formatMixSummary(mix)).toMatch(/Parking/);
  });
});

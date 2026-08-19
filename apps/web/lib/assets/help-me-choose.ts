/**
 * Pure Help Me Choose matcher — preferences narrow browsing; never claims suitability.
 */

import {
  catalogueMinBasis,
  matchesMinBand
} from "@/lib/assets/catalogue-view";
import { isMultiIncome, type IncomeMixEntry } from "@/lib/assets/income-streams";
import {
  listFieldsToPresentationInput,
  type OpportunityListFields
} from "@/lib/assets/list-fields";
import type { MetricProvenance } from "@/lib/assets/metric-provenance";
import {
  buildOpportunityPresentation,
  normalizeSiteType,
  siteTypeDisplay
} from "@/lib/assets/presentation";

export type ChooserBudget = "under10" | "10to25" | "over25";
export type ChooserPlace = "airport" | "station" | "city" | "retail";
export type ChooserTerm = "le11" | "eq12" | "ge13";
export type ChooserFigures = "simpler" | "mixed";

export type ChooserAnswers = {
  budget: ChooserBudget | null;
  place: ChooserPlace | null;
  term: ChooserTerm | null;
  figures: ChooserFigures | null;
};

export type ChooserMatch = {
  asset: OpportunityListFields;
  reasons: string[];
};

export type ChooserResult = {
  results: ChooserMatch[];
  relaxedPlace: boolean;
};

const EMPTY_ANSWERS: ChooserAnswers = {
  budget: null,
  place: null,
  term: null,
  figures: null
};

const STARTER_REASON = "A few open opportunities to start with";

const BUDGET_REASON: Record<ChooserBudget, string> = {
  under10: "From under €10k",
  "10to25": "From €10–25k",
  over25: "From over €25k"
};

const TERM_ORDER: ChooserTerm[] = ["le11", "eq12", "ge13"];

/** Single year as-is; ranged `A–B` / `A-B` → midpoint; else null. */
export function parseLeaseYears(leaseLabel: string): number | null {
  const trimmed = leaseLabel.trim().toLowerCase();
  if (!trimmed) return null;

  const range = trimmed.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return (a + b) / 2;
  }

  const single = trimmed.match(/(\d+(?:\.\d+)?)/);
  if (!single) return null;
  const n = Number(single[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Term bands: ≤11 → le11; ≥13 → ge13; otherwise ~12 (eq12).
 * Midpoints such as 12.5 from a 10–15 range land in eq12.
 */
export function classifyTermYears(years: number): ChooserTerm {
  if (years <= 11) return "le11";
  if (years >= 13) return "ge13";
  return "eq12";
}

function termAdjacent(a: ChooserTerm, b: ChooserTerm): boolean {
  return Math.abs(TERM_ORDER.indexOf(a) - TERM_ORDER.indexOf(b)) === 1;
}

function isOpenAsset(asset: OpportunityListFields): boolean {
  return (
    buildOpportunityPresentation(listFieldsToPresentationInput(asset)).status.id === "open"
  );
}

function parkingPct(mix: IncomeMixEntry[]): number {
  const entry = mix.find((m) => m.id === "vehicle_parking");
  return entry?.pct ?? 0;
}

function softScore(asset: OpportunityListFields, answers: ChooserAnswers): number {
  let score = 0;

  if (answers.term) {
    const years = parseLeaseYears(asset.leaseLabel ?? "");
    if (years != null) {
      const band = classifyTermYears(years);
      if (band === answers.term) score += 2;
      else if (termAdjacent(band, answers.term)) score += 1;
    }
  }

  if (answers.figures) {
    const mix = asset.incomeMix ?? [];
    const multi = isMultiIncome(mix);
    const parkingLed = parkingPct(mix) >= 80;
    const visitors = asset.visitorsProvenance as MetricProvenance | undefined;
    const revenue = asset.revenueProvenance as MetricProvenance | undefined;
    const modelled = visitors === "modelled" || revenue === "modelled";
    const contractedLean =
      (visitors === "contracted" || visitors === "withheld" || visitors == null) &&
      (revenue === "contracted" || revenue === "withheld" || revenue == null) &&
      !modelled;

    if (answers.figures === "simpler") {
      if (parkingLed) score += 2;
      else if (!multi) score += 1;
      if (contractedLean) score += 1;
    } else {
      if (multi) score += 2;
      if (modelled) score += 1;
    }
  }

  return score;
}

function buildReasons(
  asset: OpportunityListFields,
  answers: ChooserAnswers,
  allSkipped: boolean
): string[] {
  if (allSkipped) return [STARTER_REASON];

  const reasons: string[] = [];

  if (answers.budget) {
    reasons.push(BUDGET_REASON[answers.budget]);
  }

  if (answers.place) {
    const label = siteTypeDisplay(asset.siteType) ?? answers.place;
    reasons.push(label);
  }

  if (answers.term) {
    const years = parseLeaseYears(asset.leaseLabel ?? "");
    if (years != null) {
      const rounded = Number.isInteger(years) ? String(years) : years.toFixed(1);
      reasons.push(`About ${rounded} years`);
    }
  }

  if (answers.figures) {
    const mix = asset.incomeMix ?? [];
    if (answers.figures === "simpler") {
      reasons.push(parkingPct(mix) >= 80 ? "Mostly parking income" : "Clearer figures");
    } else if (isMultiIncome(mix)) {
      reasons.push("Mixed income");
    } else if (
      asset.visitorsProvenance === "modelled" ||
      asset.revenueProvenance === "modelled"
    ) {
      reasons.push("Includes modelled figures");
    } else {
      reasons.push("Open to mixed figures");
    }
  }

  return reasons.length > 0 ? reasons : [STARTER_REASON];
}

function filterHard(
  pool: OpportunityListFields[],
  answers: Pick<ChooserAnswers, "budget" | "place">
): OpportunityListFields[] {
  return pool.filter((asset) => {
    if (answers.budget && !matchesMinBand(catalogueMinBasis(asset), answers.budget)) {
      return false;
    }
    if (answers.place && normalizeSiteType(asset.siteType) !== answers.place) {
      return false;
    }
    return true;
  });
}

function allAnswersSkipped(answers: ChooserAnswers): boolean {
  return (
    answers.budget == null &&
    answers.place == null &&
    answers.term == null &&
    answers.figures == null
  );
}

function rankAndTake(
  candidates: OpportunityListFields[],
  answers: ChooserAnswers,
  allSkipped: boolean
): ChooserMatch[] {
  const ranked = [...candidates].sort((a, b) => {
    const scoreDiff = softScore(b, answers) - softScore(a, answers);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  });

  return ranked.slice(0, 3).map((asset) => ({
    asset,
    reasons: buildReasons(asset, answers, allSkipped)
  }));
}

/**
 * Match open published assets to chooser answers.
 * Hard: budget + place (with one place relax). Soft: term + figures.
 */
export function matchHelpMeChoose(
  assets: OpportunityListFields[],
  answers: ChooserAnswers = EMPTY_ANSWERS
): ChooserResult {
  const openPool = assets.filter(isOpenAsset);
  const skipped = allAnswersSkipped(answers);

  if (skipped) {
    return {
      results: rankAndTake(openPool, answers, true),
      relaxedPlace: false
    };
  }

  let relaxedPlace = false;
  let hardAnswers: Pick<ChooserAnswers, "budget" | "place"> = {
    budget: answers.budget,
    place: answers.place
  };

  let candidates = filterHard(openPool, hardAnswers);

  if (candidates.length === 0 && answers.place != null) {
    relaxedPlace = true;
    hardAnswers = { budget: answers.budget, place: null };
    candidates = filterHard(openPool, hardAnswers);
  }

  if (candidates.length === 0) {
    return { results: [], relaxedPlace };
  }

  // Why lines omit place when it was relaxed away.
  const reasonAnswers: ChooserAnswers = relaxedPlace
    ? { ...answers, place: null }
    : answers;

  return {
    results: rankAndTake(candidates, reasonAnswers, false),
    relaxedPlace
  };
}

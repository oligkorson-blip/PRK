"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { AssetCard } from "@/components/asset-card";
import {
  matchHelpMeChoose,
  type ChooserAnswers,
  type ChooserMatch
} from "@/lib/assets/help-me-choose";
import type { OpportunityListFields } from "@/lib/assets/list-fields";
import {
  CHOOSER_ILLUSTRATIVE_DISCLAIMER,
  CHOOSER_NON_ADVISORY_LINE
} from "@/lib/copy/consumer";

type StepKey = keyof ChooserAnswers;

type StepDef = {
  key: StepKey;
  question: string;
  lead: string;
  options: { value: string; label: string }[];
};

const STEPS: StepDef[] = [
  {
    key: "budget",
    question: "What size investment are you exploring?",
    lead: "We will show open opportunities in that range.",
    options: [
      { value: "under10", label: "Under €10k" },
      { value: "10to25", label: "€10k – €25k" },
      { value: "over25", label: "Over €25k" }
    ]
  },
  {
    key: "place",
    question: "Where do you want to look first?",
    lead: "Choose a place type — or skip to see every type.",
    options: [
      { value: "airport", label: "Airport" },
      { value: "station", label: "Station" },
      { value: "city", label: "City" },
      { value: "retail", label: "Retail" }
    ]
  },
  {
    key: "term",
    question: "Any lease length in mind?",
    lead: "This only changes the order. Nothing is hidden.",
    options: [
      { value: "le11", label: "Up to 11 years" },
      { value: "eq12", label: "About 12 years" },
      { value: "ge13", label: "13 years or more" }
    ]
  },
  {
    key: "figures",
    question: "What kind of numbers are you happy to read?",
    lead: "About how income is shown — not about risk.",
    options: [
      { value: "simpler", label: "Mostly parking income" },
      { value: "mixed", label: "Mixed income is fine" }
    ]
  }
];

const EMPTY_ANSWERS: ChooserAnswers = {
  budget: null,
  place: null,
  term: null,
  figures: null
};

export function HelpMeChooseResults({
  matches,
  relaxedPlace,
  onChangeAnswers,
  headingRef
}: {
  matches: ChooserMatch[];
  relaxedPlace: boolean;
  onChangeAnswers: () => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="help-choose-results">
      <header className="help-choose-results-head">
        <p className="kicker">A shortlist to start with</p>
        <h1 ref={headingRef} tabIndex={-1} className="help-choose-question display-m">
          Here are a few to look at
        </h1>
        <p className="help-choose-lead">
          Up to three open opportunities. Open any page and take your time.
        </p>
      </header>

      <div className="help-choose-disclaimers">
        <p className="field-hint">{CHOOSER_ILLUSTRATIVE_DISCLAIMER}</p>
        <p className="field-hint">{CHOOSER_NON_ADVISORY_LINE}</p>
      </div>

      {relaxedPlace ? (
        <p className="help-choose-relax" role="status">
          Nothing in that place type for your budget — showing matches across other places.
        </p>
      ) : null}

      {matches.length === 0 ? (
        <div className="help-choose-empty">
          <h2 className="h3">No matches for those choices</h2>
          <p className="lead">Change your answers, or browse the full list.</p>
        </div>
      ) : (
        <ul className="help-choose-result-list">
          {matches.map(({ asset, reasons }) => (
            <li key={asset.id} className="help-choose-result">
              <AssetCard asset={asset} />
              <p className="help-choose-why">{reasons.join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="help-choose-results-actions">
        <Link className="btn btn-primary" href="/opportunities">
          See all opportunities
        </Link>
        <button type="button" className="btn btn-ghost" onClick={onChangeAnswers}>
          Try again
        </button>
      </div>
    </div>
  );
}

export function HelpMeChooseWizard({ assets }: { assets: OpportunityListFields[] }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<ChooserAnswers>(EMPTY_ANSWERS);
  const [showResults, setShowResults] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const step = STEPS[stepIndex];
  const selected = step ? answers[step.key] : null;
  const match = showResults ? matchHelpMeChoose(assets, answers) : null;

  useEffect(() => {
    headingRef.current?.focus();
  }, [stepIndex, showResults]);

  function setAnswer(value: string) {
    if (!step) return;
    setAnswers((prev) => ({ ...prev, [step.key]: value as never }));
  }

  function goNext() {
    if (stepIndex >= STEPS.length - 1) {
      setShowResults(true);
      return;
    }
    setStepIndex((i) => i + 1);
  }

  function skip() {
    if (!step) return;
    setAnswers((prev) => ({ ...prev, [step.key]: null }));
    goNext();
  }

  function continueStep() {
    if (!selected) return;
    goNext();
  }

  function goBack() {
    if (showResults) {
      setShowResults(false);
      return;
    }
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  if (showResults && match) {
    return (
      <div className="help-choose-stage help-choose-stage-results">
        <HelpMeChooseResults
          matches={match.results}
          relaxedPlace={match.relaxedPlace}
          onChangeAnswers={() => {
            setShowResults(false);
            setStepIndex(0);
          }}
          headingRef={headingRef}
        />
      </div>
    );
  }

  return (
    <div className="help-choose-stage">
      <div className="help-choose-progress" aria-live="polite">
        Step {stepIndex + 1} of {STEPS.length}
        <span className="help-choose-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={STEPS[i].key}
              className={`help-choose-dot${i === stepIndex ? " is-active" : ""}${
                i < stepIndex ? " is-done" : ""
              }`}
            />
          ))}
        </span>
      </div>

      <h1 ref={headingRef} tabIndex={-1} className="help-choose-question display-m">
        {step.question}
      </h1>
      <p className="help-choose-lead">{step.lead}</p>

      <div
        className="help-choose-choices"
        role="radiogroup"
        aria-label={step.question}
      >
        {step.options.map((opt, index) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected || (!selected && index === 0) ? 0 : -1}
              className={`help-choose-choice${isSelected ? " is-selected" : ""}`}
              onClick={() => setAnswer(opt.value)}
              onKeyDown={(event) => {
                const direction =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : event.key === "Home"
                        ? -step.options.length
                        : event.key === "End"
                          ? step.options.length
                          : 0;
                if (!direction) return;
                event.preventDefault();
                const next =
                  direction === -step.options.length
                    ? 0
                    : direction === step.options.length
                      ? step.options.length - 1
                      : (index + direction + step.options.length) % step.options.length;
                setAnswer(step.options[next]!.value);
                (event.currentTarget.parentElement?.querySelectorAll("button")[next] as HTMLButtonElement | undefined)?.focus();
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="help-choose-nav">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={goBack}
          disabled={stepIndex === 0}
        >
          Back
        </button>
        <button type="button" className="btn btn-ghost" onClick={skip}>
          Skip
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={continueStep}
          disabled={!selected}
        >
          {stepIndex >= STEPS.length - 1 ? "Show matches" : "Continue"}
        </button>
      </div>

      <div className="help-choose-disclaimers">
        <p className="field-hint">{CHOOSER_ILLUSTRATIVE_DISCLAIMER}</p>
      </div>
    </div>
  );
}

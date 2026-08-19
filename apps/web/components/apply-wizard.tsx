"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { submitApplication } from "@/lib/apply/actions";
import { APPLICATION_COUNTRIES, APPLICATION_TICKET_BANDS } from "@/lib/apply/validation";
import { RISK_LINE } from "@/lib/copy/consumer";

type Step = 1 | 2 | 3;

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  countryOfResidence: string;
  companyLegalName: string;
  countryOfIncorporation: string;
  ticketBand: string;
  goalsNote: string;
  terms: boolean;
  risk: boolean;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  countryOfResidence: "",
  companyLegalName: "",
  countryOfIncorporation: "",
  ticketBand: "",
  goalsNote: "",
  terms: false,
  risk: false
};

const STEPS = [
  { n: 1 as const, label: "Profile" },
  { n: 2 as const, label: "Your plan" },
  { n: 3 as const, label: "Confirm" }
] as const;

const PLAN_OPTIONS: ReadonlyArray<{
  id: (typeof APPLICATION_TICKET_BANDS)[number];
  tag: string;
  title: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    id: "5-25k",
    tag: "From €5k",
    title: "€5–25k",
    description: "Smaller initial commitment while you review opportunities.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="5" y="4" width="14" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    )
  },
  {
    id: "25-100k",
    tag: "Popular",
    title: "€25–100k",
    description: "A typical first investment on Parkwise.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3l8 5-8 5-8-5 8-5z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M4 13l8 5 8-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    id: "100k+",
    tag: "Larger tickets",
    title: "€100k+",
    description: "For experienced investors or family offices.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 19C5 9.5 10.5 4 20 4c0 9.5-5.5 15-15 15z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M5 19c3-6 7-9.5 11-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
];

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function accountTypeLabel(type: "individual" | "company"): string {
  return type === "individual" ? "Individual" : "Company";
}

function ticketBandLabel(band: string): string {
  const match = PLAN_OPTIONS.find((option) => option.id === band);
  return match?.title ?? "Prefer not to say";
}

export function ApplyWizard({ opportunitySlug, opportunityOption }: { opportunitySlug?: string; opportunityOption?: string } = {}) {
  const [step, setStep] = useState<Step>(1);
  const [accountType, setAccountType] = useState<"individual" | "company">("individual");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const stepRef = useRef<Step>(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wizardRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    stepRef.current = step;
    // Only move focus/scroll on an actual step change — on first render this
    // would show a permanent focus ring on the heading and auto-scroll the page.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    headingRef.current?.focus();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    wizardRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start"
    });
  }, [step]);

  useEffect(() => {
    // Announce the confirmation after the submit button is replaced by the success panel.
    if (!doneMessage) return;
    headingRef.current?.focus();
  }, [doneMessage]);

  useEffect(() => {
    if (!Object.values(fieldErrors).some(Boolean)) return;
    wizardRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [fieldErrors]);

  useEffect(() => {
    if (isPending || !error) return;
    errorRef.current?.focus();
  }, [error, isPending]);

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    const cleared = Object.fromEntries(Object.keys(patch).map((key) => [key, false]));
    setFieldErrors((prev) => ({ ...prev, ...cleared }));
  }

  function goToStep(next: Step) {
    setError(null);
    setStep(next);
  }

  function validateStep(current: Step): boolean {
    const errors: Record<string, boolean> = {};
    let ok = true;

    if (current === 1) {
      if (!form.firstName.trim()) {
        errors.firstName = true;
        ok = false;
      }
      if (!form.lastName.trim()) {
        errors.lastName = true;
        ok = false;
      }
      if (!validEmail(form.email)) {
        errors.email = true;
        ok = false;
      }
      if (!form.phone.trim()) {
        errors.phone = true;
        ok = false;
      }
      if (!form.countryOfResidence) {
        errors.countryOfResidence = true;
        ok = false;
      }
      if (accountType === "company") {
        if (!form.companyLegalName.trim()) {
          errors.companyLegalName = true;
          ok = false;
        }
        if (!form.countryOfIncorporation.trim()) {
          errors.countryOfIncorporation = true;
          ok = false;
        }
      }
    }

    if (current === 3) {
      if (!form.terms) {
        errors.terms = true;
        ok = false;
      }
      if (!form.risk) {
        errors.risk = true;
        ok = false;
      }
    }

    setFieldErrors(errors);
    return ok;
  }

  function handleContinue() {
    if (!validateStep(step)) return;
    if (step < 3) goToStep((step + 1) as Step);
  }

  function handleBack() {
    if (step > 1) goToStep((step - 1) as Step);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validateStep(3)) return;

    startTransition(async () => {
      try {
        const result = await submitApplication({
          accountType,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          countryOfResidence: form.countryOfResidence,
          companyLegalName: form.companyLegalName || undefined,
          countryOfIncorporation: form.countryOfIncorporation || undefined,
          ticketBand: form.ticketBand || undefined,
          goalsNote: form.goalsNote || undefined,
          opportunitySlug,
          opportunityOption,
          termsAccepted: form.terms,
          riskAccepted: form.risk
        });

        if (stepRef.current !== 3) return;

        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDoneMessage(result.message);
      } catch {
        if (stepRef.current !== 3) return;
        setError("We couldn't submit your application just yet. Please try again, or contact the team if it continues.");
      }
    });
  }

  const showSignInHint =
    Boolean(error) && /sign in|already have access|already applied/i.test(error ?? "");

  const summaryRows = [
    ["Name", `${form.firstName.trim()} ${form.lastName.trim()}`.trim()],
    ["Email", form.email.trim()],
    ["Account type", accountTypeLabel(accountType)],
    ["Country", form.countryOfResidence || "—"],
    ["Phone", form.phone.trim() || "—"],
    ["Typical amount", ticketBandLabel(form.ticketBand)]
  ] as const;

  if (doneMessage) {
    return (
      <div className="apply-wizard" ref={wizardRef}>
        <nav className="steps-indicator" aria-label="Application steps">
          {STEPS.map((item, index) => (
            <div key={item.n} className="step-dot-wrap">
              <div className="step-dot done">
                <i>{item.n}</i>
                <span>{item.label}</span>
              </div>
              {index < STEPS.length - 1 ? <div className="step-line done" aria-hidden="true" /> : null}
            </div>
          ))}
        </nav>
        <div className="form-card">
          <div className="success-panel">
            <div className="success-icon" aria-hidden>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 12.5l5 5L20 6.5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 ref={headingRef} tabIndex={-1}>
              Application received{form.firstName.trim() ? `, ${form.firstName.trim()}` : ""}.
            </h2>
            <p className="lead apply-success-lead">
              {doneMessage} We&apos;ll email you once we&apos;ve reviewed your application.
            </p>
            <section className="apply-confirm-legal" aria-labelledby="apply-signing-heading">
              <h3 id="apply-signing-heading">What happens next</h3>
              <p className="field-hint">
                Your application is non-binding until an agreement is reviewed and signed.
              </p>
              <Link className="btn btn-ghost" href="/contact">
                Review next steps with our team
              </Link>
            </section>
            <div className="apply-success-actions">
              <Link className="btn btn-primary" href="/guides">
                Read our guides <span className="arrow">→</span>
              </Link>
              <Link className="btn btn-ghost" href="/sign-in">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="apply-wizard" ref={wizardRef}>
      <nav className="steps-indicator" aria-label="Application steps">
        {STEPS.map((item, index) => (
          <div key={item.n} className="step-dot-wrap">
            <div
              className={`step-dot${step === item.n ? " active" : ""}${step > item.n ? " done" : ""}`}
              aria-current={step === item.n ? "step" : undefined}
            >
              <i>{item.n}</i>
              <span>{item.label}</span>
            </div>
            {index < STEPS.length - 1 ? (
              <div className={`step-line${step > item.n ? " done" : ""}`} aria-hidden="true" />
            ) : null}
          </div>
        ))}
      </nav>

      <form className="form-card apply-form-card" onSubmit={handleSubmit} noValidate>
        {step === 1 ? (
          <div className="form-step">
            <p className="form-kicker">Step 1 of 3 — Your profile</p>
            <h2 ref={headingRef} tabIndex={-1}>
              Create your investor profile
            </h2>
            <div className="form-grid">
              <div className={`form-field${fieldErrors.firstName ? " error" : ""}`}>
                <label htmlFor="apply-first">
                  First name <em>*</em>
                </label>
                <input
                  id="apply-first"
                  name="firstName"
                  autoComplete="given-name"
                  required
                  aria-invalid={fieldErrors.firstName || undefined}
                  aria-describedby={fieldErrors.firstName ? "apply-first-error" : undefined}
                  value={form.firstName}
                  onChange={(e) => patchForm({ firstName: e.target.value })}
                />
                <span id="apply-first-error" className="field-error">
                  Please enter your first name.
                </span>
              </div>
              <div className={`form-field${fieldErrors.lastName ? " error" : ""}`}>
                <label htmlFor="apply-last">
                  Last name <em>*</em>
                </label>
                <input
                  id="apply-last"
                  name="lastName"
                  autoComplete="family-name"
                  required
                  aria-invalid={fieldErrors.lastName || undefined}
                  aria-describedby={fieldErrors.lastName ? "apply-last-error" : undefined}
                  value={form.lastName}
                  onChange={(e) => patchForm({ lastName: e.target.value })}
                />
                <span id="apply-last-error" className="field-error">
                  Please enter your last name.
                </span>
              </div>
              <div className={`form-field${fieldErrors.email ? " error" : ""}`}>
                <label htmlFor="apply-email">
                  Email <em>*</em>
                </label>
                <input
                  id="apply-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  aria-invalid={fieldErrors.email || undefined}
                  aria-describedby={fieldErrors.email ? "apply-email-error" : undefined}
                  value={form.email}
                  onChange={(e) => patchForm({ email: e.target.value })}
                />
                <span id="apply-email-error" className="field-error">
                  Please enter a valid email address.
                </span>
              </div>
              <div className={`form-field${fieldErrors.phone ? " error" : ""}`}>
                <label htmlFor="apply-phone">
                  Phone <em>*</em>
                </label>
                <input
                  id="apply-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  aria-invalid={fieldErrors.phone || undefined}
                  aria-describedby={fieldErrors.phone ? "apply-phone-error" : undefined}
                  value={form.phone}
                  onChange={(e) => patchForm({ phone: e.target.value })}
                />
                <span id="apply-phone-error" className="field-error">
                  Please enter a phone number.
                </span>
              </div>
              <div className={`form-field${fieldErrors.countryOfResidence ? " error" : ""}`}>
                <label htmlFor="apply-country">
                  Country of residence <em>*</em>
                </label>
                <select
                  id="apply-country"
                  name="countryOfResidence"
                  autoComplete="country-name"
                  required
                  aria-invalid={fieldErrors.countryOfResidence || undefined}
                  aria-describedby={
                    fieldErrors.countryOfResidence ? "apply-country-error" : undefined
                  }
                  value={form.countryOfResidence}
                  onChange={(e) => patchForm({ countryOfResidence: e.target.value })}
                >
                  <option value="" disabled>
                    Select your country
                  </option>
                  {APPLICATION_COUNTRIES.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
                <span id="apply-country-error" className="field-error">
                  Please select your country of residence.
                </span>
              </div>
              <div className="form-field">
                <label htmlFor="apply-type">
                  Investor type <em>*</em>
                </label>
                <select
                  id="apply-type"
                  name="accountType"
                  value={accountType}
                  onChange={(e) =>
                    setAccountType(e.target.value === "company" ? "company" : "individual")
                  }
                >
                  <option value="individual">Individual</option>
                  <option value="company">Company</option>
                </select>
              </div>
              {accountType === "company" ? (
                <>
                  <div className={`form-field full${fieldErrors.companyLegalName ? " error" : ""}`}>
                    <label htmlFor="apply-company">
                      Company legal name <em>*</em>
                    </label>
                    <input
                      id="apply-company"
                      name="companyLegalName"
                      required
                      aria-invalid={fieldErrors.companyLegalName || undefined}
                      aria-describedby={
                        fieldErrors.companyLegalName ? "apply-company-error" : undefined
                      }
                      value={form.companyLegalName}
                      onChange={(e) => patchForm({ companyLegalName: e.target.value })}
                    />
                    <span id="apply-company-error" className="field-error">
                      Please enter the company legal name.
                    </span>
                  </div>
                  <div
                    className={`form-field full${fieldErrors.countryOfIncorporation ? " error" : ""}`}
                  >
                    <label htmlFor="apply-incorporation">
                      Country of incorporation <em>*</em>
                    </label>
                    <select
                      id="apply-incorporation"
                      name="countryOfIncorporation"
                      required
                      aria-invalid={fieldErrors.countryOfIncorporation || undefined}
                      aria-describedby={
                        fieldErrors.countryOfIncorporation
                          ? "apply-incorporation-error"
                          : undefined
                      }
                      value={form.countryOfIncorporation}
                      onChange={(e) => patchForm({ countryOfIncorporation: e.target.value })}
                    >
                      <option value="" disabled>
                        Select the country
                      </option>
                      {APPLICATION_COUNTRIES.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                    <span id="apply-incorporation-error" className="field-error">
                      Please select the country of incorporation.
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="form-step">
            <p className="form-kicker">Step 2 of 3 — Your plan</p>
            <h2 ref={headingRef} tabIndex={-1}>
              Roughly how much would you invest?
            </h2>
            <p className="field-hint apply-plan-hint">
              Optional — helps us point you to the right opportunities. You can change this later.
            </p>
            <div className="choice-cards" role="group" aria-label="Investment amount">
              {PLAN_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`choice-card${form.ticketBand === option.id ? " selected" : ""}`}
                  onClick={() => patchForm({ ticketBand: option.id })}
                  aria-pressed={form.ticketBand === option.id}
                >
                  <span className="choice-tag">{option.tag}</span>
                  <span className="choice-icon">{option.icon}</span>
                  <b>{option.title}</b>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
            <div className="form-field full">
              <label htmlFor="apply-goals">Goals or questions</label>
              <textarea
                id="apply-goals"
                name="goalsNote"
                rows={3}
                maxLength={500}
                placeholder="Optional — anything we should know before review"
                value={form.goalsNote}
                onChange={(e) => patchForm({ goalsNote: e.target.value })}
              />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="form-step">
            <p className="form-kicker">Step 3 of 3 — Confirm</p>
            <h2 ref={headingRef} tabIndex={-1}>
              Review and confirm
            </h2>
            <div className="summary-list" aria-label="Application summary">
              {summaryRows.map(([label, value]) => (
                <div key={label} className="summary-row">
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
            <div className="apply-confirm-legal">
              <p className="field-hint">{RISK_LINE}</p>
              <div className={`form-field${fieldErrors.terms ? " error" : ""}`}>
                <div className="check-row">
                  <input
                    id="apply-terms"
                    name="terms"
                    type="checkbox"
                    required
                    aria-invalid={fieldErrors.terms || undefined}
                    aria-describedby={fieldErrors.terms ? "apply-terms-error" : undefined}
                    checked={form.terms}
                    onChange={(e) => patchForm({ terms: e.target.checked })}
                  />
                  <label htmlFor="apply-terms">
                    I accept the{" "}
                    <Link href="/legal/terms" target="_blank" rel="noreferrer">
                      Platform terms
                    </Link>
                  </label>
                </div>
                <span id="apply-terms-error" className="field-error">
                  Please accept the Platform terms.
                </span>
              </div>
              <div className={`form-field${fieldErrors.risk ? " error" : ""}`}>
                <div className="check-row">
                  <input
                    id="apply-risk"
                    name="risk"
                    type="checkbox"
                    required
                    aria-invalid={fieldErrors.risk || undefined}
                    aria-describedby={fieldErrors.risk ? "apply-risk-error" : undefined}
                    checked={form.risk}
                    onChange={(e) => patchForm({ risk: e.target.checked })}
                  />
                  <label htmlFor="apply-risk">
                    I have read the{" "}
                    <Link href="/legal/risk" target="_blank" rel="noreferrer">
                      Risk disclosure
                    </Link>
                  </label>
                </div>
                <span id="apply-risk-error" className="field-error">
                  Please confirm you have read the Risk disclosure.
                </span>
              </div>
            </div>
            {error ? (
              <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
                {error}
                {showSignInHint ? (
                  <>
                    {" "}
                    <Link href="/sign-in">Sign in</Link>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="form-foot">
          <span className="secure-note">
            Secure form ·{" "}
            <Link href="/legal/privacy" target="_blank" rel="noreferrer">
              Privacy notice
            </Link>
          </span>
          <div className="form-foot-actions">
            {step > 1 ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={isPending}
                onClick={handleBack}
              >
                Back
              </button>
            ) : null}
            {step < 3 ? (
              <button type="button" className="btn btn-primary" onClick={handleContinue}>
                Continue <span className="arrow">→</span>
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {isPending ? "Submitting…" : "Submit application"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
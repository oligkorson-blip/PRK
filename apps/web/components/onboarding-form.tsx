"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APPLICATION_COUNTRIES } from "@/lib/apply/validation";
import { completeOnboarding, type CompleteOnboardingResult } from "@/lib/onboarding/actions";

const initialState: CompleteOnboardingResult = { ok: false, error: "" };

type OnboardingFormProps = {
  accountType: "individual" | "company";
  defaultFullName?: string;
  defaultCountry?: string;
  defaultPhone?: string;
  defaultCompanyLegalName?: string;
  defaultCountryOfIncorporation?: string;
};

const STEPS = ["Profile", "Suitability", "Confirm"] as const;

// Same 8-option list as the apply wizard. A stored value outside the list
// (legacy free text) is kept as an extra option so re-rendering the form
// doesn't silently lose it.
function CountrySelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const known = (APPLICATION_COUNTRIES as readonly string[]).includes(defaultValue ?? "");
  return (
    <select name={name} required defaultValue={defaultValue ?? ""}>
      <option value="" disabled>
        Select a country
      </option>
      {defaultValue && !known ? <option value={defaultValue}>{defaultValue}</option> : null}
      {APPLICATION_COUNTRIES.map((country) => (
        <option key={country} value={country}>
          {country}
        </option>
      ))}
    </select>
  );
}

export function OnboardingForm({
  accountType,
  defaultFullName,
  defaultCountry,
  defaultPhone,
  defaultCompanyLegalName,
  defaultCountryOfIncorporation
}: OnboardingFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const sectionRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null)
  ];
  const [state, formAction, isPending] = useActionState(completeOnboarding, initialState);
  const serverError = state.ok ? null : state.error;
  const serverErrorRef = useRef<HTMLParagraphElement>(null);
  const [pendingReportStep, setPendingReportStep] = useState<number | null>(null);

  useEffect(() => {
    if (state.ok) {
      router.push("/portal");
      router.refresh();
    }
  }, [state.ok, router]);

  // Move focus to a server-side error so the next step is clear for keyboard and screen-reader users.
  useEffect(() => {
    if (isPending || state.ok || !state.error) return;
    serverErrorRef.current?.focus();
  }, [isPending, serverError]);

  // Report validity only once the failing step is actually visible —
  // reportValidity() on a display:none section shows nothing.
  useEffect(() => {
    if (pendingReportStep === null || pendingReportStep !== step) return;
    validateStep(pendingReportStep);
    setPendingReportStep(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReportStep, step]);

  function validateStep(index: number, report = true): boolean {
    const root = sectionRefs[index].current;
    if (!root) return true;
    const fields = root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea"
    );
    for (const field of fields) {
      if (!field.checkValidity()) {
        if (report) field.reportValidity();
        return false;
      }
    }
    return true;
  }

  return (
    <form action={formAction} className="onboarding-form" noValidate>
      <nav className="onboarding-steps" aria-label="Onboarding progress">
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={`onboarding-step${index === step ? " active" : ""}${index < step ? " done" : ""}`}
            aria-current={index === step ? "step" : undefined}
          >
            <span className="onboarding-step-num">{index + 1}</span>
            {label}
          </span>
        ))}
      </nav>

      <div ref={sectionRefs[0]} className={`form-section${step === 0 ? "" : " is-hidden"}`}>
        <h2 className="display-s">{accountType === "company" ? "Company profile" : "Your profile"}</h2>
        <div className="form-grid">
          <label className="form-field">
            <span>{accountType === "company" ? "Contact full name" : "Full name"} <em>*</em></span>
            <input name="fullName" type="text" required minLength={2} maxLength={120} defaultValue={defaultFullName} />
          </label>
          <label className="form-field">
            <span>Country of residence <em>*</em></span>
            <CountrySelect name="country" defaultValue={defaultCountry} />
          </label>
          <label className="form-field">
            <span>Phone (optional)</span>
            <input name="phone" type="tel" maxLength={40} defaultValue={defaultPhone} />
          </label>
          {accountType === "company" ? (
            <>
              <label className="form-field">
                <span>Company legal name <em>*</em></span>
                <input
                  name="companyLegalName"
                  type="text"
                  required
                  minLength={2}
                  maxLength={200}
                  defaultValue={defaultCompanyLegalName}
                />
              </label>
              <label className="form-field">
                <span>Country of incorporation <em>*</em></span>
                <CountrySelect name="countryOfIncorporation" defaultValue={defaultCountryOfIncorporation} />
              </label>
              <label className="form-field">
                <span>Registration / company number <em>*</em></span>
                <input name="companyNumber" type="text" required minLength={2} maxLength={50} />
              </label>
              <label className="form-field form-field-wide">
                <span>Registered address <em>*</em></span>
                <textarea name="address" required minLength={5} maxLength={300} rows={2} />
              </label>
            </>
          ) : (
            <>
              <label className="form-field">
                <span>Date of birth <em>*</em></span>
                <input name="dateOfBirth" type="date" required />
              </label>
              <label className="form-field form-field-wide">
                <span>Nationality <em>*</em></span>
                <input name="nationality" type="text" required minLength={2} maxLength={80} />
              </label>
              <label className="form-field form-field-wide">
                <span>Residential address <em>*</em></span>
                <textarea name="address" required minLength={5} maxLength={300} rows={2} />
              </label>
            </>
          )}
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            if (validateStep(0)) setStep(1);
          }}
        >
          Continue <span className="arrow">→</span>
        </button>
      </div>

      <div ref={sectionRefs[1]} className={`form-section${step === 1 ? "" : " is-hidden"}`}>
        <h2 className="display-s">Investment profile</h2>
        <div className="form-grid">
          <label className="form-field form-field-wide">
            <span>Investment horizon <em>*</em></span>
            <select name="investmentHorizon" required defaultValue="">
              <option value="" disabled>
                Select a horizon
              </option>
              <option value="3-5">3–5 years</option>
              <option value="5-10">5–10 years</option>
              <option value="10+">10+ years</option>
            </select>
          </label>
          <label className="form-field form-field-wide">
            <span>Source of funds <em>*</em></span>
            <textarea name="sourceOfFunds" required minLength={2} maxLength={200} rows={3} />
          </label>
          <fieldset className="form-field form-field-wide">
            <legend>Are you a politically exposed person (PEP)? <em>*</em></legend>
            <span className="field-hint">
              A PEP holds or has held a prominent public function, or is a close family member or
              associate of someone who does.
            </span>
            <label className="form-checkbox">
              <input name="pepDeclaration" type="radio" value="no" required />
              <span>No</span>
            </label>
            <label className="form-checkbox">
              <input name="pepDeclaration" type="radio" value="yes" required />
              <span>Yes</span>
            </label>
          </fieldset>
        </div>
        <div className="onboarding-nav-row">
          <button className="btn btn-ghost" type="button" onClick={() => setStep(0)}>
            Back
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              if (validateStep(1)) setStep(2);
            }}
          >
            Continue <span className="arrow">→</span>
          </button>
        </div>
      </div>

      <div ref={sectionRefs[2]} className={`form-section${step === 2 ? "" : " is-hidden"}`}>
        <h2 className="display-s">Before you invest</h2>
        <p className="field-hint">
          Before confirming, review who this offering is for in our{" "}
          <Link href="/legal/risk">Risk disclosure</Link>.
        </p>
        <label className="form-checkbox">
          <input name="isQualifyingInvestor" type="checkbox" required />
          <span>
            I confirm I meet the eligibility criteria in the <Link href="/legal/risk">Risk disclosure</Link>{" "}
            for this offering.
          </span>
        </label>
        <label className="form-checkbox">
          <input name="understandsCapitalAtRisk" type="checkbox" required />
          <span>I understand capital is at risk and target returns are not guaranteed.</span>
        </label>
        <label className="form-checkbox">
          <input name="acceptTerms" type="checkbox" required />
          <span>
            I have read and accept the <Link href="/legal/terms">Platform terms</Link> and{" "}
            <Link href="/legal/privacy">Privacy notice</Link>.
          </span>
        </label>
        <label className="form-checkbox">
          <input name="acceptRisk" type="checkbox" required />
          <span>
            I have read and accept the <Link href="/legal/risk">Risk disclosure</Link>.
          </span>
        </label>

        {serverError ? (
          <p ref={serverErrorRef} className="form-error" role="alert" tabIndex={-1}>
            {serverError}
          </p>
        ) : null}

        <div className="onboarding-nav-row">
          <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>
            Back
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={isPending}
            onClick={(event) => {
              const firstInvalid = [0, 1, 2].find((index) => !validateStep(index, index === step));
              if (firstInvalid === undefined) return;
              event.preventDefault();
              if (firstInvalid !== step) {
                // Jump to the failing step first, then report once it has rendered.
                setStep(firstInvalid);
                setPendingReportStep(firstInvalid);
              }
            }}
          >
            {isPending ? "Submitting…" : "Finish setup"}
          </button>
        </div>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InvestorDetail } from "@/lib/access/queries";
import { APPLICATION_COUNTRIES } from "@/lib/apply/validation";
import { assistedKycUpload } from "@/lib/kyc/assisted-actions";
import {
  assistedAcceptDeclarations,
  assistedOnboardingProfile
} from "@/lib/onboarding/assisted-actions";
import { investmentHorizonOptions, onboardingProfileSchema } from "@/lib/onboarding/schema";

// Same 8-option list as the apply wizard; a legacy stored value outside the
// list is kept as an extra option so the select still shows it.
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

export function AdminAssistedKyc({ investor }: { investor: InvestorDetail }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (message) {
      messageRef.current?.focus();
    }
  }, [error, isPending, message]);

  const eligibility = investor.eligibilityAnswers;
  const accountType = investor.accountType ?? "individual";
  const baseProfile = {
    accountType,
    fullName: investor.fullName,
    country: investor.country,
    phone: investor.phone ?? "",
    address: investor.address ?? "",
    pepDeclaration: investor.pepDeclaration,
    investmentHorizon: eligibility.investmentHorizon,
    sourceOfFunds: eligibility.sourceOfFunds
  };
  const profileValid = onboardingProfileSchema.safeParse(
    accountType === "company"
      ? {
          ...baseProfile,
          companyLegalName: investor.companyLegalName ?? "",
          countryOfIncorporation: investor.countryOfIncorporation ?? "",
          companyNumber: investor.companyNumber ?? ""
        }
      : {
          ...baseProfile,
          dateOfBirth: investor.dateOfBirth ?? "",
          nationality: investor.nationality ?? ""
        }
  ).success;
  const onboardingDone = investor.onboardingStatus === "completed";
  const canUpload = investor.kycStatus === "not_started" || investor.kycStatus === "rejected";

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      let result: { ok: boolean; error?: string };
      try {
        result = await action();
      } catch {
        setError("The action could not be completed. Please try again.");
        return;
      }
      if (!result.ok) {
        setError(result.error ?? "Failed");
        return;
      }
      setMessage(done);
      router.refresh();
    });
  }

  function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const result = await assistedKycUpload(investor.id, fd);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage("File uploaded.");
        form.reset();
        router.refresh();
      } catch {
        setError("The upload could not be completed. Please try again.");
      }
    });
  }

  function handleProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const pep = fd.get("pepDeclaration");
    const base = {
      fullName: String(fd.get("fullName") ?? ""),
      country: String(fd.get("country") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      address: String(fd.get("address") ?? ""),
      pepDeclaration: pep === "yes" ? true : pep === "no" ? false : null,
      investmentHorizon: String(fd.get("investmentHorizon") ?? ""),
      sourceOfFunds: String(fd.get("sourceOfFunds") ?? "")
    };
    const fields =
      accountType === "company"
        ? {
            ...base,
            companyLegalName: String(fd.get("companyLegalName") ?? ""),
            countryOfIncorporation: String(fd.get("countryOfIncorporation") ?? ""),
            companyNumber: String(fd.get("companyNumber") ?? "")
          }
        : {
            ...base,
            dateOfBirth: String(fd.get("dateOfBirth") ?? ""),
            nationality: String(fd.get("nationality") ?? "")
          };
    run(() => assistedOnboardingProfile(investor.id, fields), "Profile saved.");
  }

  const defaultHorizon =
    typeof eligibility.investmentHorizon === "string" ? eligibility.investmentHorizon : "";
  const defaultSourceOfFunds =
    typeof eligibility.sourceOfFunds === "string" ? eligibility.sourceOfFunds : "";

  return (
    <div className="admin-assisted-kyc">
      <p className="field-hint stack-b-4">
        Complete KYC steps on behalf of this investor. Every action is audit-logged against your
        staff account; the investor&apos;s own portal path stays available.
      </p>

      {canUpload ? (
      <form className="interest-form stack-4" onSubmit={handleUpload} aria-busy={isPending}>
        <fieldset className="form-fieldset" disabled={isPending}>
          <legend className="sr-only">Document upload</legend>
          <h3 className="h4">Upload a document</h3>
          <label className="form-field">
            <span>Category</span>
            <select name="category" defaultValue="kyc_id">
              <option value="kyc_id">ID document</option>
              <option value="kyc_address">Address proof</option>
              <option value="kyc_company">Company document</option>
              <option value="kyc_source_funds">Source of funds</option>
              <option value="kyc_other">Other</option>
            </select>
          </label>
          <label className="form-field">
            <span>Title (optional — defaults to the file name)</span>
            <input name="title" type="text" maxLength={200} />
          </label>
          <label className="form-field">
            <span>File (PDF / JPEG / PNG, max 10 MB)</span>
            <input name="file" type="file" accept=".pdf,image/jpeg,image/png" required />
          </label>
          <button className="btn btn-ghost" type="submit" disabled={isPending}>
            Upload for investor
          </button>
        </fieldset>
      </form>
      ) : (
        <p className="field-hint">Document upload is locked while this KYC submission is being reviewed or has been approved.</p>
      )}

      <form className="interest-form stack-4" onSubmit={handleProfile} aria-busy={isPending}>
        <fieldset className="form-fieldset" disabled={isPending}>
          <legend className="sr-only">Onboarding profile</legend>
          <h3 className="h4">Onboarding profile</h3>
          <div className="form-grid">
            <label className="form-field">
              <span>Full name</span>
              <input
                name="fullName"
                type="text"
                required
                minLength={2}
                maxLength={120}
                defaultValue={investor.fullName}
              />
            </label>
            <label className="form-field">
              <span>Country of residence</span>
              <CountrySelect name="country" defaultValue={investor.country} />
            </label>
            <label className="form-field">
              <span>Phone (optional — leaving it blank keeps the existing number)</span>
              <input name="phone" type="tel" maxLength={40} defaultValue={investor.phone ?? ""} />
            </label>
            {accountType === "company" ? (
              <>
                <label className="form-field">
                  <span>Company legal name</span>
                  <input
                    name="companyLegalName"
                    type="text"
                    required
                    minLength={2}
                    maxLength={200}
                    defaultValue={investor.companyLegalName ?? ""}
                  />
                </label>
                <label className="form-field">
                  <span>Country of incorporation</span>
                  <CountrySelect
                    name="countryOfIncorporation"
                    defaultValue={investor.countryOfIncorporation ?? ""}
                  />
                </label>
                <label className="form-field">
                  <span>Registration / company number</span>
                  <input
                    name="companyNumber"
                    type="text"
                    required
                    minLength={2}
                    maxLength={50}
                    defaultValue={investor.companyNumber ?? ""}
                  />
                </label>
                <label className="form-field form-field-wide">
                  <span>Registered address</span>
                  <textarea
                    name="address"
                    required
                    minLength={5}
                    maxLength={300}
                    rows={2}
                    defaultValue={investor.address ?? ""}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="form-field">
                  <span>Date of birth</span>
                  <input name="dateOfBirth" type="date" required defaultValue={investor.dateOfBirth ?? ""} />
                </label>
                <label className="form-field">
                  <span>Nationality</span>
                  <input
                    name="nationality"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    defaultValue={investor.nationality ?? ""}
                  />
                </label>
                <label className="form-field form-field-wide">
                  <span>Residential address</span>
                  <textarea
                    name="address"
                    required
                    minLength={5}
                    maxLength={300}
                    rows={2}
                    defaultValue={investor.address ?? ""}
                  />
                </label>
              </>
            )}
            <label className="form-field">
              <span>Investment horizon</span>
              <select name="investmentHorizon" required defaultValue={defaultHorizon}>
                <option value="" disabled>
                  Select a horizon
                </option>
                {investmentHorizonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "3-5" ? "3–5 years" : option === "5-10" ? "5–10 years" : "10+ years"}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field form-field-wide">
              <span>Source of funds</span>
              <textarea
                name="sourceOfFunds"
                required
                minLength={2}
                maxLength={200}
                rows={3}
                defaultValue={defaultSourceOfFunds}
              />
            </label>
            <fieldset className="form-field form-field-wide">
              <legend>Is the investor a politically exposed person (PEP)?</legend>
              <label className="form-checkbox">
                <input
                  name="pepDeclaration"
                  type="radio"
                  value="no"
                  required
                  defaultChecked={investor.pepDeclaration === false}
                />
                <span>No</span>
              </label>
              <label className="form-checkbox">
                <input
                  name="pepDeclaration"
                  type="radio"
                  value="yes"
                  required
                  defaultChecked={investor.pepDeclaration === true}
                />
                <span>Yes</span>
              </label>
            </fieldset>
          </div>
          <button className="btn btn-ghost" type="submit" disabled={isPending}>
            Save profile
          </button>
        </fieldset>
      </form>

      <div className="stack-4">
        <h3 className="h4">Declarations</h3>
        <p className="field-hint">Completing onboarding records that the investor, through you:</p>
        <ul className="field-hint">
          <li>meets the eligibility criteria for this offering;</li>
          <li>understands capital is at risk and target returns are not guaranteed;</li>
          <li>has read and accepts the Platform terms and Privacy notice;</li>
          <li>has read and accepts the Risk disclosure.</li>
        </ul>
        <button
          className="btn btn-primary"
          type="button"
          disabled={isPending || !profileValid || onboardingDone}
          onClick={() =>
            run(() => assistedAcceptDeclarations(investor.id), "Onboarding completed.")
          }
        >
          Complete onboarding on behalf of investor
        </button>
        {!profileValid && !onboardingDone ? (
          <p className="field-hint">Save a valid profile above before completing onboarding.</p>
        ) : null}
      </div>

      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          ref={messageRef}
          className="field-hint"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
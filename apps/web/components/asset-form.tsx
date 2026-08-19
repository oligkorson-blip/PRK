"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAsset, updateDraftAsset } from "@/lib/assets/admin-actions";
import { INCOME_STREAM_IDS, INCOME_STREAM_LABELS } from "@/lib/assets/income-streams";
import { supportsGreenOption } from "@/lib/assets/investment-options";
import { SITE_TYPE_OPTIONS, type AssetFormInput } from "@/lib/assets/asset-form";

function inputFromForm(fd: FormData): AssetFormInput {
  return {
    name: String(fd.get("name") ?? ""),
    city: String(fd.get("city") ?? ""),
    country: String(fd.get("country") ?? ""),
    siteType: String(fd.get("siteType") ?? ""),
    spaces: String(fd.get("spaces") ?? ""),
    occupancyPct: String(fd.get("occupancyPct") ?? ""),
    operator: String(fd.get("operator") ?? ""),
    term: String(fd.get("term") ?? ""),
    paymentFrequency: String(fd.get("paymentFrequency") ?? ""),
    advisoryCapacityEur: String(fd.get("advisoryCapacityEur") ?? ""),
    description: String(fd.get("description") ?? ""),
    coverImageUrl: String(fd.get("coverImageUrl") ?? ""),
    placeStory: String(fd.get("placeStory") ?? ""),
    operatorStory: String(fd.get("operatorStory") ?? ""),
    demandStory: String(fd.get("demandStory") ?? ""),
    numbersNote: String(fd.get("numbersNote") ?? ""),
    visitorsProvenance: String(fd.get("visitorsProvenance") ?? "withheld"),
    revenueProvenance: String(fd.get("revenueProvenance") ?? "withheld"),
    incomeMix: INCOME_STREAM_IDS.map((id) => ({
      id,
      pct: String(fd.get(`mix_${id}`) ?? "")
    })),
    standardMinTicketEur: String(fd.get("standardMinTicketEur") ?? ""),
    standardYieldPct: String(fd.get("standardYieldPct") ?? ""),
    premiumEnabled: fd.get("premiumEnabled") === "on",
    premiumMinTicketEur: String(fd.get("premiumMinTicketEur") ?? ""),
    premiumYieldPct: String(fd.get("premiumYieldPct") ?? ""),
    greenEnabled: fd.get("greenEnabled") === "on",
    greenMinTicketEur: String(fd.get("greenMinTicketEur") ?? ""),
    greenYieldPct: String(fd.get("greenYieldPct") ?? "")
  };
}

export function AssetForm({
  mode,
  assetId,
  initial
}: {
  mode: "create" | "edit";
  assetId?: string;
  initial: AssetFormInput;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mixPcts, setMixPcts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.incomeMix.map((entry) => [entry.id, entry.pct]))
  );
  const [premiumOn, setPremiumOn] = useState(initial.premiumEnabled);
  const [greenOn, setGreenOn] = useState(initial.greenEnabled);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    }
  }, [error, isPending]);

  const greenEligible = supportsGreenOption(
    INCOME_STREAM_IDS.map((id) => ({ id, pct: Number(mixPcts[id] ?? "") || 0 })).filter(
      (entry) => entry.pct > 0
    )
  );

  // Live income-mix total so the "must sum to 100" rule is visible while typing.
  const mixTotal = INCOME_STREAM_IDS.reduce(
    (sum, id) => sum + (Number(mixPcts[id] ?? "") || 0),
    0
  );
  const mixTotalOk = Math.abs(mixTotal - 100) <= 0.5;
  const mixTotalDisplay = Math.round(mixTotal * 100) / 100;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const input = inputFromForm(new FormData(event.currentTarget));
    startTransition(async () => {
      try {
        const result =
          mode === "create"
            ? await createAsset(input)
            : await updateDraftAsset({ assetId: assetId!, form: input });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push("/admin/assets");
        router.refresh();
      } catch {
        setError("The opportunity could not be saved. Please try again.");
      }
    });
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Name</span>
        <input name="name" type="text" defaultValue={initial.name} required />
      </label>
      <label className="form-field">
        <span>City</span>
        <input name="city" type="text" defaultValue={initial.city} required />
      </label>
      <label className="form-field">
        <span>Country</span>
        <input name="country" type="text" defaultValue={initial.country} required />
      </label>
      <label className="form-field">
        <span>Site type</span>
        <select name="siteType" defaultValue={initial.siteType}>
          <option value="">Not specified</option>
          {SITE_TYPE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">
        This authoring flow is for provider-managed investment opportunities such as airports,
        stations, retail destinations, and city locations. Use Community spaces for private,
        residential, garage, or local-host listings.
      </p>
      <fieldset className="form-field">
        <legend>Operating profile</legend>
        <p className="field-hint">
          Required before publication. Use the latest supportable figures and keep source evidence
          with the opportunity documents.
        </p>
        <label className="form-field">
          <span>Parking spaces</span>
          <input
            name="spaces"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            defaultValue={initial.spaces}
            required
          />
        </label>
        <label className="form-field">
          <span>Occupancy (%)</span>
          <input
            name="occupancyPct"
            type="number"
            inputMode="decimal"
            min="0.01"
            max="100"
            step="0.01"
            defaultValue={initial.occupancyPct}
            required
          />
        </label>
      </fieldset>
      <label className="form-field">
        <span>Operator</span>
        <input name="operator" type="text" defaultValue={initial.operator} required />
      </label>
      <label className="form-field">
        <span>Term</span>
        <input
          name="term"
          type="text"
          defaultValue={initial.term}
          placeholder='e.g. "12 years"'
          required
        />
      </label>
      <label className="form-field">
        <span>Target payment frequency</span>
        <select name="paymentFrequency" defaultValue={initial.paymentFrequency}>
          <option value="monthly">Monthly</option>
          <option value="other">Other / see deal documents</option>
        </select>
      </label>
      <label className="form-field">
        <span>Advisory capacity (€)</span>
        <input
          name="advisoryCapacityEur"
          type="text"
          inputMode="numeric"
          defaultValue={initial.advisoryCapacityEur}
          placeholder="e.g. 1500000"
        />
      </label>
      <p className="field-hint">Used for funding % on the consumer site. Blank clears.</p>
      <label className="form-field">
        <span>Description</span>
        <textarea name="description" rows={4} defaultValue={initial.description} required />
      </label>
      <fieldset className="form-field">
        <legend>Content &amp; honesty</legend>
        <p className="field-hint">
          Optional place, operator, and demand stories, plus figure labels. Leave blank to keep thin
          public templates / withheld metrics. Do not restate the Description.
        </p>
        <label className="form-field">
          <span>Place story</span>
          <textarea name="placeStory" rows={3} defaultValue={initial.placeStory} />
        </label>
        <label className="form-field">
          <span>Operator story</span>
          <textarea name="operatorStory" rows={3} defaultValue={initial.operatorStory} />
        </label>
        <label className="form-field">
          <span>Demand story</span>
          <textarea name="demandStory" rows={3} defaultValue={initial.demandStory} />
        </label>
        <label className="form-field">
          <span>Numbers note</span>
          <textarea name="numbersNote" rows={2} defaultValue={initial.numbersNote} />
        </label>
        <label className="form-field">
          <span>Visitors figure label</span>
          <select name="visitorsProvenance" defaultValue={initial.visitorsProvenance}>
            <option value="withheld">Withheld</option>
            <option value="modelled">Modelled</option>
            <option value="contracted">Contracted</option>
          </select>
        </label>
        <label className="form-field">
          <span>Revenue figure label</span>
          <select name="revenueProvenance" defaultValue={initial.revenueProvenance}>
            <option value="withheld">Withheld</option>
            <option value="modelled">Modelled</option>
            <option value="contracted">Contracted</option>
          </select>
        </label>
      </fieldset>
      <label className="form-field">
        <span>Cover image URL</span>
        <input
          name="coverImageUrl"
          type="text"
          defaultValue={initial.coverImageUrl}
          placeholder="https://… or /site/path"
        />
      </label>

      <fieldset className="form-field">
        <legend>Income mix (%)</legend>
        <p className="field-hint">
          Must sum to 100, with vehicle parking the largest stream.
        </p>
        <p className={`mix-total${mixTotalOk ? " mix-total-ok" : ""}`} aria-live="polite">
          Total: {mixTotalDisplay}% of 100%
        </p>
        {INCOME_STREAM_IDS.map((id) => (
          <label className="form-field" key={id}>
            <span>{INCOME_STREAM_LABELS[id]}</span>
            <input
              name={`mix_${id}`}
              type="text"
              inputMode="decimal"
              value={mixPcts[id] ?? ""}
              onChange={(event) =>
                setMixPcts((prev) => ({ ...prev, [id]: event.target.value }))
              }
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="form-field">
        <legend>Standard option (required)</legend>
        <label className="form-field">
          <span>Minimum ticket (€)</span>
          <input
            name="standardMinTicketEur"
            type="text"
            inputMode="numeric"
            defaultValue={initial.standardMinTicketEur}
            required
          />
        </label>
        <label className="form-field">
          <span>Target yield (%)</span>
          <input
            name="standardYieldPct"
            type="text"
            inputMode="decimal"
            defaultValue={initial.standardYieldPct}
            required
          />
        </label>
      </fieldset>

      <fieldset className="form-field">
        <legend>
          <label>
            <input
              type="checkbox"
              name="premiumEnabled"
              checked={premiumOn}
              onChange={(event) => setPremiumOn(event.target.checked)}
            />{" "}
            Add Premium option
          </label>
        </legend>
        {premiumOn ? (
          <>
            <label className="form-field">
              <span>Minimum ticket (€)</span>
              <input
                name="premiumMinTicketEur"
                type="text"
                inputMode="numeric"
                defaultValue={initial.premiumMinTicketEur}
              />
            </label>
            <label className="form-field">
              <span>Target yield (%) — must be ≥ Standard</span>
              <input
                name="premiumYieldPct"
                type="text"
                inputMode="decimal"
                defaultValue={initial.premiumYieldPct}
              />
            </label>
          </>
        ) : null}
      </fieldset>

      {greenEligible ? (
        <fieldset className="form-field">
          <legend>
            <label>
              <input
                type="checkbox"
                name="greenEnabled"
                checked={greenOn}
                onChange={(event) => setGreenOn(event.target.checked)}
              />{" "}
              Add EV option
            </label>
          </legend>
          {greenOn ? (
            <>
              <label className="form-field">
                <span>Minimum ticket (€)</span>
                <input
                  name="greenMinTicketEur"
                  type="text"
                  inputMode="numeric"
                  defaultValue={initial.greenMinTicketEur}
                />
              </label>
              <label className="form-field">
                <span>Target yield (%) — must be ≥ Standard/Premium</span>
                <input
                  name="greenYieldPct"
                  type="text"
                  inputMode="decimal"
                  defaultValue={initial.greenYieldPct}
                />
              </label>
            </>
          ) : null}
        </fieldset>
      ) : null}

      {error ? (
        <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={isPending}>
        {isPending
          ? "Saving…"
          : mode === "create"
            ? "Create draft opportunity"
            : "Save draft"}
      </button>
    </form>
  );
}

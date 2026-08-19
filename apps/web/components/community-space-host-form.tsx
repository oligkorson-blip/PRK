"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitHostInterest,
  type HostInterestActionState
} from "@/lib/community-spaces/host-actions";
import {
  COMMUNITY_SPACE_TYPE_LABELS,
  COMMUNITY_SPACE_TYPES
} from "@/lib/community-spaces/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send space details"}
    </button>
  );
}

export function CommunitySpaceHostForm({
  communitySpacesEnabled = false
}: {
  communitySpacesEnabled?: boolean;
}) {
  const [state, action] = useActionState<HostInterestActionState, FormData>(
    submitHostInterest,
    null
  );

  if (state?.ok) {
    return (
      <div className="form-card" role="status">
        <p className="form-kicker">Request received</p>
        <h2>We will review the space with you.</h2>
        <p>{state.message}</p>
        <p className="field-hint">
          Your submission is a host enquiry, not a published listing or booking agreement.
        </p>
        {communitySpacesEnabled ? (
          <Link className="btn btn-ghost" href="/spaces">
            Browse spaces
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="form-card">
      <div>
        <p className="form-kicker">Host enquiry</p>
        <h2>Tell us about your space</h2>
        <p className="field-hint">
          Share only a general area. Parkwise will verify the host and space before publication,
          and exact residential addresses stay private.
        </p>
      </div>

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="host-name">Full name <em>*</em></label>
          <input id="host-name" name="fullName" autoComplete="name" required maxLength={120} />
        </div>
        <div className="form-field">
          <label htmlFor="host-email">Email <em>*</em></label>
          <input id="host-email" name="email" type="email" autoComplete="email" required maxLength={254} />
        </div>
        <div className="form-field">
          <label htmlFor="host-phone">Phone <em>*</em></label>
          <input id="host-phone" name="phone" type="tel" autoComplete="tel" required maxLength={40} />
        </div>
        <div className="form-field">
          <label htmlFor="host-type">Space type <em>*</em></label>
          <select id="host-type" name="spaceType" defaultValue="residential" required>
            {COMMUNITY_SPACE_TYPES.map((type) => (
              <option key={type} value={type}>
                {COMMUNITY_SPACE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="host-city">City <em>*</em></label>
          <input id="host-city" name="city" required maxLength={80} placeholder="Limassol" />
        </div>
        <div className="form-field">
          <label htmlFor="host-district">District or area</label>
          <input id="host-district" name="district" maxLength={100} placeholder="Old Town" />
        </div>
        <div className="form-field">
          <label htmlFor="host-country">Country <em>*</em></label>
          <input id="host-country" name="country" required maxLength={80} defaultValue="Cyprus" />
        </div>
        <div className="form-field">
          <label htmlFor="host-price">Indicative monthly price</label>
          <input
            id="host-price"
            name="monthlyPriceEur"
            type="number"
            min="1"
            max="10000"
            step="1"
            inputMode="numeric"
            placeholder="120"
          />
        </div>
        <div className="form-field full">
          <label htmlFor="host-availability">When is the space available?</label>
          <input
            id="host-availability"
            name="availability"
            maxLength={160}
            placeholder="Weekdays, evenings, or all month"
          />
        </div>
        <div className="form-field full">
          <label htmlFor="host-notes">Anything else we should know?</label>
          <textarea
            id="host-notes"
            name="notes"
            rows={4}
            maxLength={500}
            placeholder="Access type, covered parking, EV charger, or other useful details"
          />
        </div>
      </div>

      <label className="form-checkbox" htmlFor="host-privacy">
        <input id="host-privacy" name="privacyAccepted" type="checkbox" required />
        <span>
          I have read the <Link href="/legal/privacy" target="_blank" rel="noreferrer">privacy notice</Link> and
          agree that Parkwise may contact me about reviewing this space.
        </span>
      </label>

      {state?.ok === false ? (
        <p className="form-error" role="alert">{state.error}</p>
      ) : null}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}

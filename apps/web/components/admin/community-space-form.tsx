"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createCommunitySpace,
  type CommunitySpaceActionState
} from "@/lib/community-spaces/actions";
import {
  COMMUNITY_SPACE_STATUS_LABELS,
  COMMUNITY_SPACE_STATUSES,
  COMMUNITY_SPACE_TYPE_LABELS,
  COMMUNITY_SPACE_TYPES
} from "@/lib/community-spaces/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? "Saving…" : "Add community space"}
    </button>
  );
}

export function CommunitySpaceForm() {
  const [state, formAction] = useActionState<CommunitySpaceActionState, FormData>(
    createCommunitySpace,
    null
  );

  return (
    <form action={formAction} className="admin-space-form">
      <div className="admin-space-form-grid">
        <label className="form-field">
          <span>Listing title</span>
          <input name="title" required placeholder="Covered parking near the marina" />
        </label>
        <label className="form-field">
          <span>Slug</span>
          <input
            name="slug"
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="marina-covered-space"
          />
        </label>
        <label className="form-field">
          <span>Host label</span>
          <input name="hostLabel" defaultValue="Private host" />
        </label>
        <label className="form-field">
          <span>Space type</span>
          <select name="spaceType" defaultValue="residential">
            {COMMUNITY_SPACE_TYPES.map((type) => (
              <option key={type} value={type}>
                {COMMUNITY_SPACE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>City</span>
          <input name="city" required placeholder="Limassol" />
        </label>
        <label className="form-field">
          <span>District or area</span>
          <input name="district" placeholder="Old Town" />
        </label>
        <label className="form-field">
          <span>Country</span>
          <input name="country" required defaultValue="Cyprus" />
        </label>
        <label className="form-field">
          <span>Monthly price (EUR)</span>
          <input
            name="monthlyPriceEur"
            required
            type="number"
            min="1"
            step="1"
            placeholder="120"
          />
        </label>
      </div>
      <label className="form-field">
        <span>Description</span>
        <textarea name="description" rows={3} placeholder="What makes this space useful?" />
      </label>
      <label className="form-field">
        <span>Features</span>
        <input
          name="features"
          placeholder="Covered, 24/7 access, EV charging (comma-separated)"
        />
      </label>
      <label className="form-field">
        <span>Access notes</span>
        <textarea
          name="accessNotes"
          rows={3}
          placeholder="Share only general access information; never publish an exact home address."
        />
      </label>
      <div className="admin-space-form-grid">
        <label className="form-field">
          <span>Publication status</span>
          <select name="status" defaultValue="draft">
            {COMMUNITY_SPACE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {COMMUNITY_SPACE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-space-checkbox">
          <input name="verified" type="checkbox" />
          <span>I manually verified this listing and host.</span>
        </label>
      </div>
      {state?.ok === false ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="form-success" role="status">
          Community space added.
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

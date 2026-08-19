/**
 * Shared copy for staff and operations surfaces.
 *
 * Keep internal tooling clear and human without exposing infrastructure details
 * such as storage paths or generic exception wording.
 */
export const OPERATIONS_ACTION_ERROR =
  "We couldn't complete that action just yet. Please try again, or ask the team if the issue continues.";

export const OPERATIONS_OPPORTUNITY_UPDATE_ERROR =
  "We couldn't update this opportunity just yet. Please try again, or ask the team if the issue continues.";

export const OPERATIONS_DOCUMENT_UPLOAD_UNAVAILABLE =
  "Document uploads are temporarily unavailable. Please try again shortly, or ask the team if you need a hand.";

export const OPERATIONS_DOCUMENT_UPLOAD_ERROR =
  "We couldn't upload that document just yet. Please try again, or ask the team if the issue continues.";

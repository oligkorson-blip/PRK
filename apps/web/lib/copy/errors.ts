/**
 * Shared user-facing error strings. Every error tells the reader what
 * happened, what to do next, and — where useful — how to get help.
 * Voice: a teammate, not a system log. Never "Something went wrong",
 * "Invalid input", or "Request failed" on their own.
 */

/** A document could not be stored. The user's file is safe to retry. */
export const ERROR_UPLOAD_STORAGE =
  "We couldn't save that document just now. Please try again — if it keeps happening, contact the team.";

/** A generic save failure where the user can simply retry. */
export const ERROR_SAVE_RETRY =
  "We couldn't save that just now. Please try again.";

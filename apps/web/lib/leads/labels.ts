export const LEAD_STATUS_VALUES = [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "duplicate",
  "converted"
] as const;

export type LeadStatus = (typeof LEAD_STATUS_VALUES)[number];

/** Friendly labels for raw enum values shown to staff (lib/portal/labels.ts pattern). */
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  unqualified: "Unqualified",
  duplicate: "Duplicate",
  converted: "Converted"
};

export const LEAD_STATUS_OPTIONS = LEAD_STATUS_VALUES.map((value) => ({
  value,
  label: LEAD_STATUS_LABEL[value]
}));

/**
 * Terminal stages — excluded from every workload/queue count. This is the
 * single source of truth for the `not in (...)` filters in
 * listIbsWithWorkload / listAgentsWithWorkload / getLeadDashboardCounts.
 */
export const TERMINAL_LEAD_STATUSES: readonly LeadStatus[] = [
  "unqualified",
  "duplicate",
  "converted"
];

/** CSS pill variant per stage (see globals.css .stage-pill-*). */
export const LEAD_STAGE_PILL_VARIANT: Record<LeadStatus, string> = {
  new: "stage-pill-new",
  contacted: "stage-pill-contacted",
  qualified: "stage-pill-qualified",
  unqualified: "stage-pill-muted",
  duplicate: "stage-pill-muted",
  converted: "stage-pill-converted"
};

/** Stages staff may move a lead to (converted is system-set only). */
export const SETTABLE_LEAD_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "duplicate"
];

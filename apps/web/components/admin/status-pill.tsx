/** Raw status → stage-pill severity class (modifiers defined in globals.css). */
const STATUS_PILL_CLASS: Record<string, string> = {
  active: "stage-pill-clear",
  approved: "stage-pill-clear",
  completed: "stage-pill-clear",
  pending_access: "stage-pill-awaiting",
  submitted: "stage-pill-awaiting",
  contacted: "stage-pill-awaiting",
  under_review: "stage-pill-awaiting",
  in_progress: "stage-pill-awaiting",
  suspended: "stage-pill-blocking",
  rejected: "stage-pill-blocking",
  not_started: "stage-pill-muted"
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span className={`stage-pill ${STATUS_PILL_CLASS[status] ?? "stage-pill-muted"}`}>
      {label}
    </span>
  );
}

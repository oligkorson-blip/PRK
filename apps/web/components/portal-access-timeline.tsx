import Link from "next/link";
import type { AccessTimelineStep } from "@/lib/portal/access-timeline";

const STATE_LABEL: Record<AccessTimelineStep["state"], string> = {
  done: "Complete",
  current: "In progress",
  todo: "Up next",
  blocked: "Needs attention"
};

function stepActionLabel(href: string): string {
  if (href === "/contact") return "Talk to the team";
  if (href === "/portal/kyc") return "Continue identity check";
  if (href === "/portal/interests") return "View requests";
  if (href === "/portal/holdings") return "View investments";
  if (href === "/portal/contracts") return "Open agreements";
  if (href === "/opportunities") return "View opportunities";
  return "Open";
}

export function PortalAccessTimeline({
  steps,
  className
}: {
  steps: AccessTimelineStep[];
  className?: string;
}) {
  return (
    <ol className={["status-timeline", className].filter(Boolean).join(" ")}>
      {steps.map((step) => (
        <li key={step.id} className={`status-timeline-item is-${step.state}`}>
          <div className="status-timeline-marker" aria-hidden="true" />
          <div className="status-timeline-body">
            <div className="status-timeline-head">
              <strong>{step.label}</strong>
              <span className="status-timeline-pill">{STATE_LABEL[step.state]}</span>
            </div>
            <p>{step.detail}</p>
            {step.href && (step.state === "current" || step.state === "blocked") ? (
              <Link className="link-arrow" href={step.href}>
                {stepActionLabel(step.href)}
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

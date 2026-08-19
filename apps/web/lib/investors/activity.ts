import { and, desc, eq } from "drizzle-orm";
import { investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import { auditEvents, db, investorNotes, investors, staffProfiles } from "@/lib/db";

/**
 * Activity timeline for the staff investor record: audit events
 * (entityType "investor") merged with manual staff notes, newest first.
 * Plain module (no "use server"): read-side only, mutations live in
 * lib/investors/note-actions.ts.
 */

export type InvestorActivityEventRow = {
  id: string;
  action: string;
  createdAt: Date;
  payload: Record<string, unknown>;
};

export type InvestorActivityNoteRow = {
  id: string;
  body: string;
  authorEmail: string;
  createdAt: Date;
};

export type InvestorActivityItem = {
  id: string;
  kind: "event" | "note";
  createdAt: Date;
  /** Friendly one-liner shown in the timeline. */
  line: string;
  /** Note body (notes only; null for system events). */
  body: string | null;
  /** Note author email (notes only; null for system events). */
  authorEmail: string | null;
};

const ACTIVITY_LINE: Record<string, string> = {
  "investor.created": "Investor record created",
  "investor.assigned": "Assigned to an agent",
  "investor.invited": "Portal invite sent",
  "investor.note_added": "Note added",
  "investor.two_factor_reset": "Two-factor authentication reset",
  "investor.password_set": "Password set",
  "investor.erased": "Investor data erased (GDPR)",
  "application.submitted": "Application submitted",
  "application.contacted": "Applicant contacted",
  "application.rejected": "Application rejected",
  "kyc.document_uploaded": "KYC document uploaded",
  "kyc.submitted": "KYC submitted for review",
  "kyc.approved": "KYC approved",
  "kyc.under_review": "KYC marked under review",
  "kyc.rejected": "KYC rejected",
  "kyc.assisted_upload": "KYC document uploaded by staff",
  "onboarding.completed": "Onboarding completed",
  "onboarding.assisted_profile_saved": "Profile saved by staff",
  "onboarding.assisted_completed": "Onboarding completed by staff",
  "aml.screening_recorded": "AML screening recorded"
};

export function formatInvestorActivityLine(
  action: string,
  _payload: Record<string, unknown>
): string {
  const known = ACTIVITY_LINE[action];
  if (known) return known;
  // Unknown future actions: humanize ("investor.future_thing" → "Investor future thing")
  return action
    .replace(/[._]+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export function mergeActivityItems(
  events: InvestorActivityEventRow[],
  notes: InvestorActivityNoteRow[]
): InvestorActivityItem[] {
  const items: InvestorActivityItem[] = [
    ...events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      createdAt: e.createdAt,
      line: formatInvestorActivityLine(e.action, e.payload),
      body: null,
      authorEmail: null
    })),
    ...notes.map((n) => ({
      id: n.id,
      kind: "note" as const,
      createdAt: n.createdAt,
      line: formatInvestorActivityLine("investor.note_added", {}),
      body: n.body,
      authorEmail: n.authorEmail
    }))
  ];
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

const ACTIVITY_LIMIT = 50;

export async function listInvestorActivityForStaff(
  investorId: string
): Promise<InvestorActivityItem[]> {
  const staff = await requireStaff();

  const [investor] = await db
    .select({ assignedAgentId: investors.assignedAgentId, ibId: investors.ibId })
    .from(investors)
    .where(eq(investors.id, investorId))
    .limit(1);

  if (!investor) {
    throw new Error("NOT_FOUND");
  }

  if (
    !investorVisibleToStaff({
      role: staff.role,
      staffId: staff.staff.id,
      investor: { assignedAgentId: investor.assignedAgentId, ibId: investor.ibId }
    })
  ) {
    throw new Error("NOT_FOUND");
  }

  const eventRows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      createdAt: auditEvents.createdAt,
      payload: auditEvents.payload
    })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityType, "investor"), eq(auditEvents.entityId, investorId)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(ACTIVITY_LIMIT);

  const noteRows = await db
    .select({
      id: investorNotes.id,
      body: investorNotes.body,
      createdAt: investorNotes.createdAt,
      authorEmail: staffProfiles.email
    })
    .from(investorNotes)
    .innerJoin(staffProfiles, eq(investorNotes.authorStaffId, staffProfiles.id))
    .where(eq(investorNotes.investorId, investorId))
    .orderBy(desc(investorNotes.createdAt))
    .limit(ACTIVITY_LIMIT);

  return mergeActivityItems(eventRows, noteRows).slice(0, ACTIVITY_LIMIT);
}

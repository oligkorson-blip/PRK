import { APPLICATION_STATUS_LABEL, KYC_STATUS_LABEL } from "@/lib/portal/labels";

/**
 * Pure derivation of the investor lifecycle "next action" for the admin
 * access panel: given the three statuses, decide which single action is the
 * primary next step and why every other action is unavailable right now.
 */

export type InvestorActionId =
  | "mark_contacted"
  | "approve_invite"
  | "regenerate_invite"
  | "kyc_under_review"
  | "approve_kyc";

export type InvestorLifecycleInput = {
  accountStatus: string;
  applicationStatus?: string | null;
  kycStatus: string;
};

export type InvestorActionPlanItem = {
  id: InvestorActionId;
  label: string;
  /** True only for the primary next action — everything else stays disabled. */
  enabled: boolean;
  /** One-line reason shown next to a disabled action. */
  reason: string | null;
};

export type InvestorActionPlan = {
  primary: InvestorActionId | null;
  actions: InvestorActionPlanItem[];
};

export const INVESTOR_ACTION_LABEL: Record<InvestorActionId, string> = {
  mark_contacted: "Mark contacted",
  approve_invite: "Approve & invite",
  regenerate_invite: "Regenerate invite",
  kyc_under_review: "KYC under review",
  approve_kyc: "Approve KYC"
};

const ACTION_ORDER: InvestorActionId[] = [
  "mark_contacted",
  "approve_invite",
  "regenerate_invite",
  "kyc_under_review",
  "approve_kyc"
];

function applicationPending(applicationStatus: string | null): boolean {
  return applicationStatus === "submitted" || applicationStatus === "contacted";
}

export function canRejectApplication(applicationStatus?: string | null): boolean {
  return applicationPending(applicationStatus ?? null);
}

export function canRejectKyc(kycStatus: string): boolean {
  return kycStatus === "submitted" || kycStatus === "under_review";
}

export function deriveInvestorActionPlan(input: InvestorLifecycleInput): InvestorActionPlan {
  const application = input.applicationStatus ?? null;
  const suspended = input.accountStatus === "suspended";
  const appPending = applicationPending(application);
  const kycPending = canRejectKyc(input.kycStatus);

  // One primary next action per state, in pipeline order.
  let primary: InvestorActionId | null = null;
  if (suspended) {
    primary = null;
  } else if (appPending) {
    primary = "approve_invite";
  } else if (kycPending) {
    primary = "approve_kyc";
  } else if (application === "approved" || input.accountStatus === "active") {
    // Invite pending: approved but the investor has not finished KYC onboarding.
    primary = "regenerate_invite";
  }

  const available: Record<InvestorActionId, boolean> = {
    mark_contacted: appPending,
    approve_invite: appPending,
    regenerate_invite: input.accountStatus === "active",
    kyc_under_review: input.kycStatus === "submitted",
    approve_kyc: kycPending
  };

  function unavailableReason(id: InvestorActionId): string {
    if (suspended) return "Investor is suspended.";
    switch (id) {
      case "mark_contacted":
        return application === null
          ? "Mark contacted is available once an application is submitted."
          : `Application is already ${APPLICATION_STATUS_LABEL[application]?.toLowerCase() ?? application}.`;
      case "approve_invite":
        if (application === null) {
          return "Approve & invite is available once an application is submitted.";
        }
        return application === "approved"
          ? "Application is already approved — regenerate the invite instead."
          : `Application is already ${APPLICATION_STATUS_LABEL[application]?.toLowerCase() ?? application}.`;
      case "regenerate_invite":
        return "Regenerate invite is available once the investor has portal access.";
      case "kyc_under_review":
        return input.kycStatus === "under_review"
          ? "KYC is already under review."
          : "KYC under review is available once KYC documents are submitted.";
      case "approve_kyc":
        return `Approve KYC is available once KYC documents are submitted (now ${
          KYC_STATUS_LABEL[input.kycStatus]?.toLowerCase() ?? input.kycStatus
        }).`;
    }
  }

  const actions: InvestorActionPlanItem[] = ACTION_ORDER.map((id) => {
    if (id === primary) {
      return { id, label: INVESTOR_ACTION_LABEL[id], enabled: true, reason: null };
    }
    const blocked = suspended || !available[id];
    return {
      id,
      label: INVESTOR_ACTION_LABEL[id],
      enabled: false,
      reason: blocked
        ? unavailableReason(id)
        : primary
          ? `Available, but ${INVESTOR_ACTION_LABEL[primary]} is the next step.`
          : "Not the next step right now."
    };
  });

  return { primary, actions };
}

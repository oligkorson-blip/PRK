import { KYC_CATEGORY_LABEL } from "@/lib/kyc/categories";

/** Friendly labels for raw enum values shown in the investor portal. */
export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  individual: "Individual",
  company: "Company"
};

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  pending_access: "Pending access",
  active: "Active",
  suspended: "Suspended"
};

export const KYC_STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected"
};

export const ONBOARDING_STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  not_started: "Not started",
  in_progress: "In progress"
};

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  contacted: "Contacted",
  approved: "Approved",
  rejected: "Rejected"
};

export const DOCUMENT_CATEGORY_LABEL: Record<string, string> = {
  ...KYC_CATEGORY_LABEL
};

export const DOCUMENT_OWNER_TYPE_LABEL: Record<string, string> = {
  asset: "Opportunity",
  holding: "Investment",
  platform: "Platform",
  investor: "Personal"
};

export const HOLDING_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  closed: "Closed"
};

export const INTEREST_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
  withdrawn: "Withdrawn"
};

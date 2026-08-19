/**
 * Consumer-facing opportunity status derived from real product signals only.
 * DB: asset_status = draft | published | closed
 * Funding: FundingSnapshot.open when capacity known and not full
 */

import type { FundingSnapshot } from "@/lib/assets/funding";

export const OPPORTUNITY_STATUS_IDS = [
  "open",
  "fully_funded",
  "closed",
  "unavailable"
] as const;

export type OpportunityStatusId = (typeof OPPORTUNITY_STATUS_IDS)[number];

export type OpportunityStatus = {
  id: OpportunityStatusId;
  /** Visible badge / label */
  label: string;
  /** Screen-reader / expanded meaning */
  a11yLabel: string;
  badgeClass: string;
  showFunding: boolean;
  permitsInterest: boolean;
};

const STATUS: Record<OpportunityStatusId, OpportunityStatus> = {
  open: {
    id: "open",
    label: "Open",
    a11yLabel: "Status: Open for investment",
    badgeClass: "badge badge-soft",
    showFunding: true,
    permitsInterest: true
  },
  fully_funded: {
    id: "fully_funded",
    label: "Fully funded",
    a11yLabel: "Status: Fully funded — not open for new investment",
    badgeClass: "badge badge-dark",
    showFunding: true,
    permitsInterest: false
  },
  closed: {
    id: "closed",
    label: "Closed",
    a11yLabel: "Status: Closed — this opportunity is no longer available",
    badgeClass: "badge badge-dark",
    showFunding: false,
    permitsInterest: false
  },
  unavailable: {
    id: "unavailable",
    label: "Unavailable",
    a11yLabel: "Status: Unavailable — investment actions are disabled",
    badgeClass: "badge badge-dark",
    showFunding: false,
    permitsInterest: false
  }
};

export type AssetStatusValue = "draft" | "published" | "closed" | string;

export function resolveOpportunityStatus(input: {
  assetStatus: AssetStatusValue;
  funding: FundingSnapshot | null | undefined;
}): OpportunityStatus {
  const { assetStatus, funding } = input;

  if (assetStatus === "closed") {
    return STATUS.closed;
  }

  if (assetStatus !== "published") {
    return STATUS.unavailable;
  }

  // Missing funding must not default to Open (Phase 1 / 2)
  if (!funding) {
    return STATUS.unavailable;
  }

  if (!funding.open) {
    return STATUS.fully_funded;
  }

  return STATUS.open;
}

export function getOpportunityStatus(id: OpportunityStatusId): OpportunityStatus {
  return STATUS[id];
}

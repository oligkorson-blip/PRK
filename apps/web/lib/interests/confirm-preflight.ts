import type { StaffRole } from "@/lib/auth/roles";

export type ConfirmPreflightCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type ConfirmPreflight = {
  canConfirm: boolean;
  checks: ConfirmPreflightCheck[];
  blockers: ConfirmPreflightCheck[];
  fourEyes: {
    required: boolean;
    awaitingSecond: boolean;
    firstApproverEmail: string | null;
  };
};

export function evaluateConfirmPreflight(input: {
  interestStatus: string;
  kycStatus: string;
  accountStatus: string;
  poolInvestmentsEnabled: boolean;
  latestAmlResult: "clear" | "review" | "rejected" | null;
  assetStatus: string;
  capacityOpen: boolean;
  amountEur: number;
  fourEyesThresholdEur: number;
  firstApproverEmail: string | null;
  staffRole: StaffRole;
}): ConfirmPreflight {
  const fourEyesRequired = input.amountEur >= input.fourEyesThresholdEur;
  const awaitingSecond = fourEyesRequired && Boolean(input.firstApproverEmail);

  const checks: ConfirmPreflightCheck[] = [
    {
      id: "pending",
      label: "Request still pending",
      ok: input.interestStatus === "pending",
      detail:
        input.interestStatus === "pending"
          ? "Ready for a decision."
          : `Already ${input.interestStatus}.`
    },
    {
      id: "account",
      label: "Account active",
      ok: input.accountStatus === "active",
      detail:
        input.accountStatus === "active"
          ? "Portal access is live."
          : `Account is ${input.accountStatus}.`
    },
    {
      id: "pool",
      label: "Pool access enabled",
      ok: input.poolInvestmentsEnabled,
      detail: input.poolInvestmentsEnabled
        ? "Investor can use the pool lane."
        : "Enable pool access on the investor record first."
    },
    {
      id: "kyc",
      label: "KYC approved",
      ok: input.kycStatus === "approved",
      detail:
        input.kycStatus === "approved"
          ? "Identity approved."
          : `KYC is ${input.kycStatus}.`
    },
    {
      id: "aml",
      label: "AML screening clear",
      ok: input.latestAmlResult === "clear",
      detail:
        input.latestAmlResult === "clear"
          ? "Latest screening is clear."
          : input.latestAmlResult
            ? `Latest screening is ${input.latestAmlResult}.`
            : "No clear screening on file."
    },
    {
      id: "asset",
      label: "Opportunity open",
      ok: input.assetStatus === "published",
      detail:
        input.assetStatus === "published"
          ? "Published and open."
          : `Asset status is ${input.assetStatus}.`
    },
    {
      id: "capacity",
      label: "Capacity available",
      ok: input.capacityOpen,
      detail: input.capacityOpen
        ? "Room remains for this ticket."
        : "Opportunity is at capacity."
    }
  ];

  if (fourEyesRequired && input.staffRole !== "super_admin") {
    checks.push({
      id: "four_eyes_role",
      label: "Four-eyes role",
      ok: false,
      detail: "Amounts at or above the threshold need two super admin approvals."
    });
  } else if (fourEyesRequired) {
    checks.push({
      id: "four_eyes",
      label: awaitingSecond ? "Second approval needed" : "Four-eyes required",
      ok: true,
      detail: awaitingSecond
        ? `First approval by ${input.firstApproverEmail}. Another super admin must confirm.`
        : "This confirmation needs two distinct super admins."
    });
  }

  const blockers = checks.filter((c) => !c.ok);
  return {
    canConfirm: blockers.length === 0,
    checks,
    blockers,
    fourEyes: {
      required: fourEyesRequired,
      awaitingSecond,
      firstApproverEmail: input.firstApproverEmail
    }
  };
}

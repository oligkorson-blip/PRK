import { describe, expect, it } from "vitest";
import {
  canRejectApplication,
  canRejectKyc,
  deriveInvestorActionPlan,
  type InvestorActionId
} from "@/lib/investors/next-action";

function enabledIds(plan: ReturnType<typeof deriveInvestorActionPlan>): InvestorActionId[] {
  return plan.actions.filter((a) => a.enabled).map((a) => a.id);
}

describe("deriveInvestorActionPlan", () => {
  it("makes Approve & invite the primary action for a submitted application", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "pending_access",
      applicationStatus: "submitted",
      kycStatus: "not_started"
    });

    expect(plan.primary).toBe("approve_invite");
    expect(enabledIds(plan)).toEqual(["approve_invite"]);
    for (const action of plan.actions.filter((a) => a.id !== "approve_invite")) {
      expect(action.enabled).toBe(false);
      expect(action.reason).toBeTruthy();
    }
  });

  it("keeps Approve & invite primary for a contacted application", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "pending_access",
      applicationStatus: "contacted",
      kycStatus: "not_started"
    });

    expect(plan.primary).toBe("approve_invite");
    expect(enabledIds(plan)).toEqual(["approve_invite"]);
  });

  it("makes Approve KYC the primary action once KYC is submitted", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "active",
      applicationStatus: "approved",
      kycStatus: "submitted"
    });

    expect(plan.primary).toBe("approve_kyc");
    expect(enabledIds(plan)).toEqual(["approve_kyc"]);
  });

  it("makes Approve KYC the primary action while KYC is under review", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "active",
      applicationStatus: "approved",
      kycStatus: "under_review"
    });

    expect(plan.primary).toBe("approve_kyc");
  });

  it("makes Regenerate invite the primary action once approved with no KYC pending", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "active",
      applicationStatus: "approved",
      kycStatus: "approved"
    });

    expect(plan.primary).toBe("regenerate_invite");
    expect(enabledIds(plan)).toEqual(["regenerate_invite"]);
  });

  it("has no primary action when there is nothing to progress", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "pending_access",
      applicationStatus: null,
      kycStatus: "not_started"
    });

    expect(plan.primary).toBeNull();
    expect(enabledIds(plan)).toEqual([]);
    for (const action of plan.actions) {
      expect(action.reason).toBeTruthy();
    }
  });

  it("disables everything with a suspended reason when the investor is suspended", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "suspended",
      applicationStatus: "submitted",
      kycStatus: "submitted"
    });

    expect(plan.primary).toBeNull();
    expect(enabledIds(plan)).toEqual([]);
    for (const action of plan.actions) {
      expect(action.reason).toBe("Investor is suspended.");
    }
  });

  it("gives an out-of-turn reason for available actions that are not primary", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "pending_access",
      applicationStatus: "submitted",
      kycStatus: "not_started"
    });

    const markContacted = plan.actions.find((a) => a.id === "mark_contacted");
    expect(markContacted?.enabled).toBe(false);
    expect(markContacted?.reason).toBe("Available, but Approve & invite is the next step.");
  });

  it("explains that Approve & invite needs a submitted application", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "pending_access",
      applicationStatus: null,
      kycStatus: "not_started"
    });

    const approve = plan.actions.find((a) => a.id === "approve_invite");
    expect(approve?.reason).toBe("Approve & invite is available once an application is submitted.");
  });

  it("points an already-approved application at Regenerate invite instead", () => {
    const plan = deriveInvestorActionPlan({
      accountStatus: "active",
      applicationStatus: "approved",
      kycStatus: "approved"
    });

    const approve = plan.actions.find((a) => a.id === "approve_invite");
    expect(approve?.reason).toBe("Application is already approved — regenerate the invite instead.");
  });
});

describe("canRejectApplication", () => {
  it("allows rejection only for submitted or contacted applications", () => {
    expect(canRejectApplication("submitted")).toBe(true);
    expect(canRejectApplication("contacted")).toBe(true);
    expect(canRejectApplication("approved")).toBe(false);
    expect(canRejectApplication("rejected")).toBe(false);
    expect(canRejectApplication(null)).toBe(false);
    expect(canRejectApplication(undefined)).toBe(false);
  });
});

describe("canRejectKyc", () => {
  it("allows rejection only while KYC is submitted or under review", () => {
    expect(canRejectKyc("submitted")).toBe(true);
    expect(canRejectKyc("under_review")).toBe(true);
    expect(canRejectKyc("not_started")).toBe(false);
    expect(canRejectKyc("approved")).toBe(false);
    expect(canRejectKyc("rejected")).toBe(false);
  });
});

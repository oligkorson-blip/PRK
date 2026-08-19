import { describe, expect, it } from "vitest";
import { evaluateConfirmPreflight } from "@/lib/interests/confirm-preflight";

describe("evaluateConfirmPreflight", () => {
  const ready = {
    interestStatus: "pending" as const,
    kycStatus: "approved",
    accountStatus: "active",
    poolInvestmentsEnabled: true,
    latestAmlResult: "clear" as const,
    assetStatus: "published",
    capacityOpen: true,
    amountEur: 10_000,
    fourEyesThresholdEur: 50_000,
    firstApproverEmail: null as string | null,
    staffRole: "super_admin" as const
  };

  it("is ready when all hard gates pass", () => {
    const result = evaluateConfirmPreflight(ready);
    expect(result.canConfirm).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it("blocks on KYC and AML", () => {
    const result = evaluateConfirmPreflight({
      ...ready,
      kycStatus: "submitted",
      latestAmlResult: null
    });
    expect(result.canConfirm).toBe(false);
    expect(result.blockers.map((b) => b.id)).toEqual(
      expect.arrayContaining(["kyc", "aml"])
    );
  });

  it("flags four-eyes as required without blocking the first click", () => {
    const result = evaluateConfirmPreflight({
      ...ready,
      amountEur: 60_000,
      firstApproverEmail: null
    });
    expect(result.canConfirm).toBe(true);
    expect(result.fourEyes.required).toBe(true);
    expect(result.fourEyes.awaitingSecond).toBe(false);
  });

  it("blocks non-super-admin when four-eyes is required", () => {
    const result = evaluateConfirmPreflight({
      ...ready,
      amountEur: 60_000,
      staffRole: "agent"
    });
    expect(result.canConfirm).toBe(false);
    expect(result.blockers.some((b) => b.id === "four_eyes_role")).toBe(true);
  });

  it("blocks when capacity is full", () => {
    const result = evaluateConfirmPreflight({
      ...ready,
      capacityOpen: false
    });
    expect(result.canConfirm).toBe(false);
    expect(result.blockers.some((b) => b.id === "capacity")).toBe(true);
  });
});

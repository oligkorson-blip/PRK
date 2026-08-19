import { describe, expect, it } from "vitest";
import { documentPackGuidance } from "@/lib/portal/document-pack-guidance";

describe("documentPackGuidance", () => {
  it("points to KYC while identity is incomplete", () => {
    const g = documentPackGuidance({
      kycStatus: "not_started",
      pendingInterests: 0,
      activeHoldings: 0,
      openAgreements: 0
    });
    expect(g.stage).toBe("identity");
    expect(g.href).toBe("/portal/kyc");
  });

  it("points to opportunities once identity is done with no requests", () => {
    const g = documentPackGuidance({
      kycStatus: "approved",
      pendingInterests: 0,
      activeHoldings: 0,
      openAgreements: 0
    });
    expect(g.stage).toBe("browse");
    expect(g.href).toBe("/opportunities");
  });

  it("explains waiting while a request is pending", () => {
    const g = documentPackGuidance({
      kycStatus: "approved",
      pendingInterests: 1,
      activeHoldings: 0,
      openAgreements: 0
    });
    expect(g.stage).toBe("waiting");
    expect(g.href).toBe("/portal/interests");
  });

  it("points to agreements when a holding exists without an open agreement", () => {
    const g = documentPackGuidance({
      kycStatus: "approved",
      pendingInterests: 0,
      activeHoldings: 1,
      openAgreements: 0
    });
    expect(g.stage).toBe("agreement");
    expect(g.href).toBe("/portal/contracts");
  });
});

import { describe, expect, it } from "vitest";
import { buildAccessTimeline } from "@/lib/portal/access-timeline";

describe("buildAccessTimeline", () => {
  it("marks KYC current after approved application and active account", () => {
    const steps = buildAccessTimeline({
      applicationStatus: "approved",
      accountStatus: "active",
      kycStatus: "not_started",
      pendingInterests: 0,
      activeHoldings: 0
    });
    expect(steps.find((s) => s.id === "application")?.state).toBe("done");
    expect(steps.find((s) => s.id === "account")?.state).toBe("done");
    expect(steps.find((s) => s.id === "kyc")?.state).toBe("current");
  });

  it("blocks interests when pending without KYC approval", () => {
    const steps = buildAccessTimeline({
      applicationStatus: "approved",
      accountStatus: "active",
      kycStatus: "submitted",
      pendingInterests: 2,
      activeHoldings: 0
    });
    expect(steps.find((s) => s.id === "interests")?.state).toBe("blocked");
  });

  it("marks investments done when holdings exist", () => {
    const steps = buildAccessTimeline({
      applicationStatus: "approved",
      accountStatus: "active",
      kycStatus: "approved",
      pendingInterests: 0,
      activeHoldings: 1
    });
    expect(steps.find((s) => s.id === "investments")?.state).toBe("done");
    expect(steps.find((s) => s.id === "interests")?.state).toBe("done");
  });
  it("marks suspended portal access as blocked without claiming an invite was sent", () => {
    const timeline = buildAccessTimeline({
      applicationStatus: "approved",
      accountStatus: "suspended",
      kycStatus: "approved",
      pendingInterests: 0,
      activeHoldings: 1
    });

    expect(timeline.find((step) => step.id === "account")).toMatchObject({
      state: "blocked",
      detail: "Please contact the team so we can help restore your access."
    });
  });

  it("adds an agreements step that stays current when holdings exist without an open agreement", () => {
    const steps = buildAccessTimeline({
      applicationStatus: "approved",
      accountStatus: "active",
      kycStatus: "approved",
      pendingInterests: 0,
      activeHoldings: 1,
      openAgreements: 0,
      awaitingAgreement: true
    });
    expect(steps.find((s) => s.id === "investments")?.state).toBe("done");
    expect(steps.find((s) => s.id === "agreements")).toMatchObject({
      state: "current",
      href: "/portal/contracts"
    });
  });

  it("marks agreements done when an open agreement exists", () => {
    const steps = buildAccessTimeline({
      applicationStatus: "approved",
      accountStatus: "active",
      kycStatus: "approved",
      pendingInterests: 0,
      activeHoldings: 1,
      openAgreements: 1,
      awaitingAgreement: false
    });
    expect(steps.find((s) => s.id === "agreements")?.state).toBe("done");
  });

  it("treats an active account without an application record as complete", () => {
    const steps = buildAccessTimeline({
      applicationStatus: null,
      accountStatus: "active",
      kycStatus: "approved",
      pendingInterests: 0,
      activeHoldings: 1,
      openAgreements: 1
    });
    expect(steps.find((s) => s.id === "application")?.state).toBe("done");
    expect(steps.find((s) => s.id === "account")?.state).toBe("done");
  });
});

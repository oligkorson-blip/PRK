import { describe, expect, it } from "vitest";
import { buildInterestRequestStages } from "@/lib/portal/interest-request-stages";

describe("buildInterestRequestStages", () => {
  it("shows submitted and waiting for a pending request with KYC approved", () => {
    const stages = buildInterestRequestStages({
      status: "pending",
      kycStatus: "approved"
    });
    expect(stages.map((s) => s.id)).toEqual([
      "submitted",
      "identity",
      "team_review",
      "outcome"
    ]);
    expect(stages.find((s) => s.id === "submitted")?.state).toBe("done");
    expect(stages.find((s) => s.id === "identity")?.state).toBe("done");
    expect(stages.find((s) => s.id === "team_review")?.state).toBe("current");
    expect(stages.find((s) => s.id === "outcome")?.state).toBe("todo");
  });

  it("blocks team review when identity is still incomplete", () => {
    const stages = buildInterestRequestStages({
      status: "pending",
      kycStatus: "submitted"
    });
    expect(stages.find((s) => s.id === "identity")?.state).toBe("current");
    expect(stages.find((s) => s.id === "team_review")?.state).toBe("blocked");
  });

  it("marks outcome done when confirmed", () => {
    const stages = buildInterestRequestStages({
      status: "confirmed",
      kycStatus: "approved"
    });
    expect(stages.find((s) => s.id === "team_review")?.state).toBe("done");
    expect(stages.find((s) => s.id === "outcome")).toMatchObject({
      state: "done",
      label: "Confirmed"
    });
  });

  it("marks declined outcome without advisory language", () => {
    const stages = buildInterestRequestStages({
      status: "declined",
      kycStatus: "approved"
    });
    expect(stages.find((s) => s.id === "outcome")).toMatchObject({
      state: "done",
      label: "Not progressed"
    });
  });
});

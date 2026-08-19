import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAccessTimeline } from "@/lib/portal/access-timeline";

const root = process.cwd();

function read(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("portal progress guidance", () => {
  it("uses calm status labels and specific next-step links", () => {
    const src = read("components/portal-access-timeline.tsx");

    expect(src).toContain('blocked: "Needs attention"');
    expect(src).toContain('if (href === "/contact") return "Talk to the team";');
    expect(src).toContain('if (href === "/portal/kyc") return "Continue identity check";');
  });

  it("offers a support route for application and account access issues", () => {
    const rejectedApplication = buildAccessTimeline({
      applicationStatus: "rejected",
      accountStatus: "active",
      kycStatus: "not_started",
      pendingInterests: 0,
      activeHoldings: 0
    });
    const application = rejectedApplication.find((step) => step.id === "application");
    expect(application).toMatchObject({ state: "blocked", href: "/contact" });
    expect(application?.detail).toContain("Contact us");

    const suspendedAccount = buildAccessTimeline({
      applicationStatus: "approved",
      accountStatus: "suspended",
      kycStatus: "not_started",
      pendingInterests: 0,
      activeHoldings: 0
    });
    const account = suspendedAccount.find((step) => step.id === "account");
    expect(account).toMatchObject({ state: "blocked", href: "/contact" });
    expect(account?.detail).toContain("restore your access");
  });

  it("keeps identity recovery clear and action-oriented", () => {
    const steps = buildAccessTimeline({
      applicationStatus: "approved",
      accountStatus: "active",
      kycStatus: "rejected",
      pendingInterests: 1,
      activeHoldings: 0
    });

    expect(steps.find((step) => step.id === "kyc")?.detail).toContain(
      "upload updated documents"
    );
    expect(steps.find((step) => step.id === "interests")?.detail).toContain(
      "complete your identity check"
    );
  });
});

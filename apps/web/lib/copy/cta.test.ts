import { describe, expect, it } from "vitest";
import {
  INTEREST_CONNECTION_ERROR,
  resolveDetailCta,
  resolveHeaderCta,
  resolveMobileDetailCta
} from "@/lib/copy/cta";
import { JOURNEY_STEPS } from "@/lib/copy/journey-steps";

describe("interest submission copy", () => {
  it("gives a clear recovery step when submission is interrupted", () => {
    expect(INTEREST_CONNECTION_ERROR).toBe(
      "We couldn't submit your interest just yet. Check your connection and try again, or contact the team if it continues."
    );
  });
});

describe("resolveDetailCta", () => {
  it("uses Request access for signed-out open opportunities", () => {
    const d = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "signed_out"
    });
    expect(d.primaryLabel).toBe("Request access");
    expect(d.primaryHref).toBe("/apply");
    expect(d.allowsInterestForm).toBe(false);
  });

  it("preserves asset and option context on the apply deep link", () => {
    const d = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "signed_out",
      assetSlug: "berlin-hub",
      optionId: "standard"
    });
    expect(d.primaryHref).toBe("/apply?asset=berlin-hub&option=standard");
  });

  it("blocks investment actions when fully funded or closed", () => {
    expect(
      resolveDetailCta({
        statusId: "fully_funded",
        allowsInvestmentCta: false,
        user: "can_interest"
      }).kind
    ).toBe("fully_funded");
    expect(
      resolveDetailCta({
        statusId: "closed",
        allowsInvestmentCta: false,
        user: "can_interest"
      }).allowsInterestForm
    ).toBe(false);
  });

  it("allows express interest for approved users on open deals", () => {
    const d = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "can_interest"
    });
    expect(d.kind).toBe("express_interest");
    expect(d.allowsInterestForm).toBe(true);
  });

  it("blocks a converted user whose individual investment access is disabled", () => {
    const d = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "can_interest",
      poolAccessEnabled: false
    });
    expect(d.kind).toBe("pool_access_pending");
    expect(d.allowsInterestForm).toBe(false);
    expect(d.message).toMatch(/not been enabled for your account/i);
  });

  it("blocks new pool requests when the super admin switch is off", () => {
    const d = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "can_interest",
      poolEnabled: false
    });
    expect(d.kind).toBe("pool_disabled");
    expect(d.allowsInterestForm).toBe(false);
    expect(d.message).toMatch(/not currently accepting/i);
  });

  it("routes incomplete accounts to finish setup", () => {
    const d = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "needs_onboarding"
    });
    expect(d.kind).toBe("finish_setup");
    expect(d.primaryLabel).toBe("Finish setup");
    expect(d.primaryHref).toBe("/onboarding");
    expect(d.allowsInterestForm).toBe(false);
  });
});

describe("resolveMobileDetailCta", () => {
  it("mirrors finish setup instead of inventing Express interest", () => {
    const cta = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "needs_onboarding"
    });
    expect(resolveMobileDetailCta({ cta, termsSeen: false })).toEqual({
      label: "Finish setup",
      href: "/onboarding"
    });
  });

  it("mirrors Request access for signed-out visitors", () => {
    const cta = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "signed_out",
      assetSlug: "milan",
      optionId: "premium"
    });
    expect(resolveMobileDetailCta({ cta, termsSeen: true })).toEqual({
      label: "Request access",
      href: "/apply?asset=milan&option=premium"
    });
  });

  it("gates express interest behind terms for eligible users", () => {
    const cta = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "can_interest"
    });
    expect(resolveMobileDetailCta({ cta, termsSeen: false })).toEqual({
      label: "Review terms",
      href: "#terms"
    });
    expect(resolveMobileDetailCta({ cta, termsSeen: true })).toEqual({
      label: "Express interest",
      href: "#mobile-interest"
    });
  });

  it("hides the bar CTA when there is no actionable primary", () => {
    const cta = resolveDetailCta({
      statusId: "open",
      allowsInvestmentCta: true,
      user: "account_inactive"
    });
    expect(resolveMobileDetailCta({ cta, termsSeen: true })).toBeNull();
  });
});

describe("resolveHeaderCta", () => {
  it("points at Request access from the catalogue", () => {
    expect(resolveHeaderCta("/opportunities")).toEqual({
      label: "Request access",
      href: "/apply"
    });
  });

  it("defaults to Request access elsewhere", () => {
    expect(resolveHeaderCta("/")).toEqual({
      label: "Request access",
      href: "/apply"
    });
  });
});

describe("JOURNEY_STEPS", () => {
  it("exposes four plain-language process steps", () => {
    expect(JOURNEY_STEPS).toHaveLength(4);
    expect(JOURNEY_STEPS.map((s) => s.title)).toEqual([
      "Explore opportunities",
      "Request an invitation",
      "Review and verify",
      "Decide and follow"
    ]);
  });
});
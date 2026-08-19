/**
 * Stage-aware CTA vocabulary for opportunity detail and marketing chrome.
 */

import type { OpportunityStatusId } from "@/lib/assets/opportunity-status";

export const INTEREST_CONNECTION_ERROR =
  "We couldn't submit your interest just yet. Check your connection and try again, or contact the team if it continues.";

export type CtaUserState =
  | "signed_out"
  | "needs_onboarding"
  | "can_interest"
  | "account_inactive";

export type DetailCtaDecision = {
  kind:
    | "apply"
    | "sign_in"
    | "finish_setup"
    | "express_interest"
    | "unavailable"
    | "closed"
    | "fully_funded"
    | "pool_disabled"
    | "pool_access_pending";
  primaryLabel: string | null;
  primaryHref: string | null;
  message: string | null;
  allowsInterestForm: boolean;
};

/** Preserve catalogue context when signed-out visitors start an application. */
export function buildApplyHref(assetSlug?: string | null, optionId?: string | null): string {
  const params = new URLSearchParams();
  if (assetSlug) params.set("asset", assetSlug);
  if (optionId) params.set("option", optionId);
  const q = params.toString();
  return q ? `/apply?${q}` : "/apply";
}

export function resolveDetailCta(input: {
  statusId: OpportunityStatusId;
  allowsInvestmentCta: boolean;
  user: CtaUserState;
  poolEnabled?: boolean;
  /** Per-investor access, controlled by super-admins; false is the safe default. */
  poolAccessEnabled?: boolean;
  assetSlug?: string | null;
  optionId?: string | null;
}): DetailCtaDecision {
  const { statusId, allowsInvestmentCta, user } = input;
  const poolEnabled = input.poolEnabled ?? true;
  const poolAccessEnabled = input.poolAccessEnabled ?? true;

  if (statusId === "closed") {
    return {
      kind: "closed",
      primaryLabel: null,
      primaryHref: null,
      message: "This opportunity is closed. View other open opportunities.",
      allowsInterestForm: false
    };
  }

  if (statusId === "fully_funded") {
    return {
      kind: "fully_funded",
      primaryLabel: null,
      primaryHref: null,
      message: "This opportunity is fully funded. Browse other open opportunities.",
      allowsInterestForm: false
    };
  }

  if (statusId === "unavailable" || !allowsInvestmentCta) {
    return {
      kind: "unavailable",
      primaryLabel: null,
      primaryHref: null,
      message: "Investment actions are not available for this opportunity right now.",
      allowsInterestForm: false
    };
  }

  if (user === "signed_out") {
    return {
      kind: "apply",
      primaryLabel: "Request access",
      primaryHref: buildApplyHref(input.assetSlug, input.optionId),
      message: null,
      allowsInterestForm: false
    };
  }

  if (user === "needs_onboarding") {
    return {
      kind: "finish_setup",
      primaryLabel: "Finish setup",
      primaryHref: "/onboarding",
      message: null,
      allowsInterestForm: false
    };
  }

  if (user === "can_interest" && !poolAccessEnabled) {
    return {
      kind: "pool_access_pending",
      primaryLabel: null,
      primaryHref: null,
      message: "Investment access has not been enabled for your account yet. Contact the Parkwise team when you are ready to discuss opportunities.",
      allowsInterestForm: false
    };
  }

  if (user === "can_interest" && !poolEnabled) {
    return {
      kind: "pool_disabled",
      primaryLabel: null,
      primaryHref: null,
      message: "Location-pool investments are not currently accepting new requests. Existing investments are unaffected.",
      allowsInterestForm: false
    };
  }

  if (user === "can_interest") {
    return {
      kind: "express_interest",
      primaryLabel: "Express interest",
      primaryHref: null,
      message: null,
      allowsInterestForm: true
    };
  }

  return {
    kind: "unavailable",
    primaryLabel: null,
    primaryHref: null,
    message: "Your account is not currently active. Talk to the team.",
    allowsInterestForm: false
  };
}

/**
 * Sticky mobile allocation bar CTA. Mirrors the decision summary when the user
 * cannot express interest yet (apply / finish setup), and only uses
 * "Express interest" after terms are in view for users who may submit.
 */
export function resolveMobileDetailCta(input: {
  cta: DetailCtaDecision;
  termsSeen: boolean;
}): { label: string; href: string } | null {
  const { cta, termsSeen } = input;

  if (cta.allowsInterestForm) {
    return termsSeen
      ? { label: "Express interest", href: "#mobile-interest" }
      : { label: "Review terms", href: "#terms" };
  }

  if (cta.primaryLabel && cta.primaryHref) {
    return { label: cta.primaryLabel, href: cta.primaryHref };
  }

  return null;
}

/** Header primary CTA for signed-out visitors */
export function resolveHeaderCta(pathname: string): { label: string; href: string } {
  if (pathname === "/apply" || pathname.startsWith("/apply")) {
    return { label: "Sign in", href: "/sign-in" };
  }
  return { label: "Request access", href: "/apply" };
}
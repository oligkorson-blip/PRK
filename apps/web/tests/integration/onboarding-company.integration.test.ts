/**
 * Integration test for the company onboarding path (lib/onboarding/actions.ts)
 * against a real Postgres scratch database. Only the session is mocked:
 * a company investor must be able to complete onboarding without a date of
 * birth, and the company CDD fields must land on the investors row.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(async () => sessionState.user),
  requireSessionUser: vi.fn(async () => {
    if (!sessionState.user) throw new Error("UNAUTHENTICATED");
    return sessionState.user;
  })
}));

import { completeOnboarding } from "@/lib/onboarding/actions";
import { describeIntegration, setupIntegrationDatabase, type IntegrationDbHandle } from "./helpers/db";
import { createInvestor, getInvestor, uniqEmail } from "./helpers/fixtures";

function companyFormData() {
  const fd = new FormData();
  fd.set("fullName", "Jane Director");
  fd.set("country", "Ireland");
  fd.set("companyLegalName", "Harbour Holdings Ltd");
  fd.set("countryOfIncorporation", "Ireland");
  fd.set("companyNumber", "IE 123456");
  fd.set("address", "12 Harbour Road, Sligo");
  fd.set("pepDeclaration", "no");
  fd.set("investmentHorizon", "5-10");
  fd.set("sourceOfFunds", "Company operating profits.");
  fd.set("isQualifyingInvestor", "on");
  fd.set("understandsCapitalAtRisk", "on");
  fd.set("acceptTerms", "on");
  fd.set("acceptRisk", "on");
  return fd;
}

describeIntegration("company onboarding (integration)", () => {
  let handle: IntegrationDbHandle;

  beforeAll(async () => {
    handle = await setupIntegrationDatabase();
  });

  afterAll(async () => {
    await handle.teardown();
  });

  it("completes onboarding for a company without a date of birth", async () => {
    const email = uniqEmail("company-onboarding");
    const { investor, authUser } = await createInvestor({
      email,
      accountType: "company",
      onboardingComplete: false
    });
    sessionState.user = authUser;

    const result = await completeOnboarding({ ok: false, error: "" }, companyFormData());

    expect(result).toEqual({ ok: true });

    const stored = await getInvestor(investor.id);
    expect(stored.onboardingStatus).toBe("completed");
    expect(stored.companyLegalName).toBe("Harbour Holdings Ltd");
    expect(stored.countryOfIncorporation).toBe("Ireland");
    expect(stored.companyNumber).toBe("IE 123456");
    expect(stored.address).toBe("12 Harbour Road, Sligo");
    expect(stored.dateOfBirth).toBeNull();
    expect(stored.nationality).toBeNull();
    expect(stored.termsAcceptedAt).not.toBeNull();
    expect(stored.riskAcceptedAt).not.toBeNull();
  });
});

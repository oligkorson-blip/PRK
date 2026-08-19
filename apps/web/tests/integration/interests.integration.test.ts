/**
 * Integration tests for lib/interests/actions.ts (create/withdraw) and
 * lib/interests/admin-actions.ts (confirm/decline) against a real Postgres
 * scratch database. Only the session is mocked; the daily-cap row lock, the
 * pending-claim UPDATE, the partial unique index, and the confirm→holding
 * transaction all run for real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { postgresErrorCode } from "@/lib/db/errors";
import { POOL_INVESTMENTS_SETTING } from "@/lib/platform-settings/keys";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

import { eq } from "drizzle-orm";
import { platformSettings } from "@/lib/db";
import { createInterest, withdrawInterest } from "@/lib/interests/actions";
import { confirmInterest, declineInterest } from "@/lib/interests/admin-actions";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  assets,
  createAsset,
  createAuthUser,
  createHolding,
  createInterestRow,
  createInvestor,
  createKycCheck,
  createStaff,
  db,
  holdings,
  interests,
  listAuditEvents,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(u: { id: string; email: string } | null) {
  sessionState.user = u;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;
type InvestorFixture = Awaited<ReturnType<typeof createInvestor>>;

describeIntegration("interest actions (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;

  async function makeIb() {
    return createStaff({ email: uniqEmail("ib"), role: "ib" });
  }
  async function makeAgent(ib: Staff) {
    return createStaff({ email: uniqEmail("agent"), role: "agent", ibId: ib.profile.id });
  }
  async function makeInvestor(
    overrides?: Partial<Parameters<typeof createInvestor>[0]>
  ) {
    return createInvestor({ email: uniqEmail("inv"), poolInvestmentsEnabled: true, ...overrides });
  }

  async function getInterest(id: string) {
    const [row] = await db.select().from(interests).where(eq(interests.id, id)).limit(1);
    return row;
  }

  beforeAll(async () => {
    handle = await setupIntegrationDatabase();
    const adminEmail = uniqEmail("sa");
    process.env.SUPER_ADMIN_EMAILS = adminEmail;
    admin = await createStaff({ email: adminEmail, role: "super_admin" });
  }, 120_000);

  afterAll(async () => {
    await handle?.teardown();
  });

  beforeEach(async () => {
    signInAs(admin.authUser);
    await db
      .insert(platformSettings)
      .values({
        key: POOL_INVESTMENTS_SETTING,
        enabled: true,
        updatedBy: admin.authUser.id
      })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { enabled: true, updatedBy: admin.authUser.id, updatedAt: new Date() }
      });
  });

  describe("createInterest (investor)", () => {
    it("creates a pending interest and audits it", async () => {
      const { investor, authUser } = await makeInvestor();
      const asset = await createAsset();

      signInAs(authUser);
      const result = await createInterest({
        assetSlug: asset.slug,
        amountEur: 25_000,
        riskAcknowledged: true
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await getInterest(result.interestId);
      expect(row).toMatchObject({
        investorId: investor.id,
        assetId: asset.id,
        amountEur: 25_000,
        status: "pending"
      });
      const audit = await listAuditEvents("interest.created", result.interestId);
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({ assetSlug: asset.slug, amountEur: 25_000 });
    });

    it("rejects a second pending interest for the same asset", async () => {
      const { authUser } = await makeInvestor();
      const asset = await createAsset();

      signInAs(authUser);
      const first = await createInterest({
        assetSlug: asset.slug,
        amountEur: 10_000,
        riskAcknowledged: true
      });
      expect(first.ok).toBe(true);

      const second = await createInterest({
        assetSlug: asset.slug,
        amountEur: 10_000,
        riskAcknowledged: true
      });
      expect(second).toEqual({
        ok: false,
        error: "You already have a pending interest in this opportunity."
      });
    });

    it("enforces the one-pending unique index at the database level", async () => {
      const { investor } = await makeInvestor();
      const asset = await createAsset();
      await createInterestRow({ investorId: investor.id, assetId: asset.id });

      // The partial unique index (0016) must reject a second pending row even
      // when the app-level pre-check is bypassed.
      await expect(
        db.insert(interests).values({
          investorId: investor.id,
          assetId: asset.id,
          amountEur: 10_000
        })
      ).rejects.toSatisfy((e) => postgresErrorCode(e) === "23505");
    });

    it("allows a new interest after the previous one was withdrawn", async () => {
      const { authUser } = await makeInvestor();
      const asset = await createAsset();

      signInAs(authUser);
      const first = await createInterest({
        assetSlug: asset.slug,
        amountEur: 10_000,
        riskAcknowledged: true
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(await withdrawInterest({ interestId: first.interestId })).toEqual({ ok: true });

      const second = await createInterest({
        assetSlug: asset.slug,
        amountEur: 15_000,
        riskAcknowledged: true
      });
      expect(second.ok).toBe(true);
    });

    it("enforces the daily cap with real rows", async () => {
      const { investor, authUser } = await makeInvestor();
      // Ten interests already today (the cap is MAX_INTERESTS_PER_DAY = 10).
      for (let i = 0; i < 10; i += 1) {
        const asset = await createAsset();
        await createInterestRow({ investorId: investor.id, assetId: asset.id });
      }
      const eleventh = await createAsset();

      signInAs(authUser);
      const result = await createInterest({
        assetSlug: eleventh.slug,
        amountEur: 10_000,
        riskAcknowledged: true
      });

      expect(result).toEqual({
        ok: false,
        error: "You've reached the limit of 10 interests per day. Please try again tomorrow."
      });
    });

    it("validates acknowledgement, amount, asset status, and gates", async () => {
      const { authUser } = await makeInvestor();
      const asset = await createAsset();
      const draft = await createAsset({ status: "draft" });

      signInAs(authUser);
      expect(
        await createInterest({ assetSlug: asset.slug, amountEur: 10_000, riskAcknowledged: false })
      ).toEqual({
        ok: false,
        error: "Confirm you understand this is non-binding and have read the Risk Disclosure."
      });
      expect(
        await createInterest({ assetSlug: asset.slug, amountEur: 5_000, riskAcknowledged: true })
      ).toEqual({ ok: false, error: "Amount must be a whole number of at least €10000." });
      expect(
        await createInterest({ assetSlug: asset.slug, amountEur: 10_000.5, riskAcknowledged: true })
      ).toEqual({ ok: false, error: "Amount must be a whole number of at least €10000." });
      expect(
        await createInterest({ assetSlug: draft.slug, amountEur: 10_000, riskAcknowledged: true })
      ).toEqual({ ok: false, error: "This opportunity is not available." });

      const notOnboarded = await makeInvestor({ onboardingComplete: false });
      signInAs(notOnboarded.authUser);
      expect(
        await createInterest({ assetSlug: asset.slug, amountEur: 10_000, riskAcknowledged: true })
      ).toEqual({
        ok: false,
        error: "Please complete onboarding before expressing interest."
      });

      const suspended = await makeInvestor({ accountStatus: "suspended" });
      signInAs(suspended.authUser);
      expect(
        await createInterest({ assetSlug: asset.slug, amountEur: 10_000, riskAcknowledged: true })
      ).toEqual({
        ok: false,
        error: "Your account isn’t ready for investment actions yet. Talk to the team."
      });

      const stranger = await createAuthUser(uniqEmail("signed-out-ish"));
      signInAs(stranger);
      const asFreshInvestor = await createInterest({
        assetSlug: asset.slug,
        amountEur: 10_000,
        riskAcknowledged: true
      });
      // A brand-new auth user gets an investor shell via ensureInvestor, but
      // onboarding is not complete, so the gate stops them.
      expect(asFreshInvestor).toEqual({
        ok: false,
        error: "Please complete onboarding before expressing interest."
      });
    });
  });

  describe("withdrawInterest (investor)", () => {
    it("withdraws a pending interest owned by the caller", async () => {
      const { authUser } = await makeInvestor();
      const asset = await createAsset();
      signInAs(authUser);
      const created = await createInterest({
        assetSlug: asset.slug,
        amountEur: 10_000,
        riskAcknowledged: true
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      expect(await withdrawInterest({ interestId: created.interestId })).toEqual({ ok: true });
      expect((await getInterest(created.interestId))?.status).toBe("withdrawn");
      const audit = await listAuditEvents("interest.withdrawn", created.interestId);
      expect(audit).toHaveLength(1);
    });

    it("hides other investors' interests and refuses non-pending rows", async () => {
      const owner = await makeInvestor();
      const stranger = await makeInvestor();
      const asset = await createAsset();
      const interest = await createInterestRow({
        investorId: owner.investor.id,
        assetId: asset.id
      });

      signInAs(stranger.authUser);
      expect(await withdrawInterest({ interestId: interest.id })).toEqual({
        ok: false,
        error: "Interest not found."
      });

      const confirmed = await createInterestRow({
        investorId: stranger.investor.id,
        assetId: asset.id,
        status: "confirmed"
      });
      expect(await withdrawInterest({ interestId: confirmed.id })).toEqual({
        ok: false,
        error: "This interest can no longer be withdrawn."
      });
    });
  });

  describe("confirmInterest (ops)", () => {
    async function makePendingInterest(staffing?: { ib: Staff; agent: Staff }) {
      const investorFixture = await makeInvestor({
        ibId: staffing?.ib.profile.id ?? null,
        assignedAgentId: staffing?.agent.profile.id ?? null,
        kycStatus: "approved"
      });
      // confirmInterest also requires a clear sanctions/PEP screening on record.
      await createKycCheck({
        investorId: investorFixture.investor.id,
        reviewedByStaffId: admin.profile.id
      });
      const asset = await createAsset();
      const interest = await createInterestRow({
        investorId: investorFixture.investor.id,
        assetId: asset.id,
        amountEur: 30_000
      });
      return { ...investorFixture, asset, interest };
    }

    it("confirms atomically: interest decided + holding created + audit", async () => {
      const { investor, asset, interest } = await makePendingInterest();

      const result = await confirmInterest({ interestId: interest.id, adminNote: "Welcome aboard." });

      expect(result).toEqual({ ok: true });
      const decided = await getInterest(interest.id);
      expect(decided?.status).toBe("confirmed");
      expect(decided?.decidedBy).toBe(admin.authUser.id);
      expect(decided?.adminNote).toBe("Welcome aboard.");

      const [holding] = await db
        .select()
        .from(holdings)
        .where(eq(holdings.interestId, interest.id));
      expect(holding).toMatchObject({
        investorId: investor.id,
        assetId: asset.id,
        amountEur: 30_000,
        status: "active"
      });
      expect(holding.targetYieldPct).toBe("7.50");

      const audit = await listAuditEvents("interest.confirmed", interest.id);
      expect(audit).toHaveLength(1);
    });

    it("cannot confirm twice (pending-claim guard)", async () => {
      const { interest } = await makePendingInterest();
      expect(await confirmInterest({ interestId: interest.id })).toEqual({ ok: true });

      const again = await confirmInterest({ interestId: interest.id });
      expect(again).toEqual({
        ok: false,
        error: "This interest is already confirmed and can no longer be confirmed."
      });

      // Exactly one holding exists for the interest (interest_id is unique).
      const rows = await db.select().from(holdings).where(eq(holdings.interestId, interest.id));
      expect(rows).toHaveLength(1);
      await expect(
        db.insert(holdings).values({
          investorId: rows[0].investorId,
          assetId: rows[0].assetId,
          interestId: interest.id,
          amountEur: 1,
          targetYieldPct: "1.00",
          confirmedAt: new Date()
        })
      ).rejects.toSatisfy((e) => postgresErrorCode(e) === "23505");
    });

    it("requires approved KYC before confirmation", async () => {
      const investorFixture = await makeInvestor({ kycStatus: "submitted" });
      const asset = await createAsset();
      const interest = await createInterestRow({
        investorId: investorFixture.investor.id,
        assetId: asset.id
      });

      expect(await confirmInterest({ interestId: interest.id })).toEqual({
        ok: false,
        error: "KYC not approved. Investor must finish KYC before confirmation."
      });
    });

    it("requires a clear AML screening before confirmation", async () => {
      // KYC approved but no kyc_checks row at all — the gate must stop confirm.
      const investorFixture = await makeInvestor({ kycStatus: "approved" });
      const asset = await createAsset();
      const interest = await createInterestRow({
        investorId: investorFixture.investor.id,
        assetId: asset.id
      });

      expect(await confirmInterest({ interestId: interest.id })).toEqual({
        ok: false,
        error: "AML screening not clear. Record a clear sanctions/PEP screening before confirming."
      });

      // A non-clear screening does not satisfy the gate either.
      await createKycCheck({
        investorId: investorFixture.investor.id,
        reviewedByStaffId: admin.profile.id,
        result: "review"
      });
      expect(await confirmInterest({ interestId: interest.id })).toEqual({
        ok: false,
        error: "AML screening not clear. Record a clear sanctions/PEP screening before confirming."
      });

      // Once a clear screening exists, the same interest confirms.
      await createKycCheck({
        investorId: investorFixture.investor.id,
        reviewedByStaffId: admin.profile.id,
        result: "clear"
      });
      expect(await confirmInterest({ interestId: interest.id })).toEqual({ ok: true });
    });

    it("gates on the LATEST screening: a later flag supersedes an earlier clear", async () => {
      const investorFixture = await makeInvestor({ kycStatus: "approved" });
      const asset = await createAsset();
      const interest = await createInterestRow({
        investorId: investorFixture.investor.id,
        assetId: asset.id,
        amountEur: 30_000
      });
      const investorId = investorFixture.investor.id;

      // Screened clear, then flagged for review afterwards. The historical
      // clear must NOT carry the confirm — the latest screening wins.
      await createKycCheck({
        investorId,
        reviewedByStaffId: admin.profile.id,
        result: "clear",
        reviewedAt: new Date("2026-01-01T00:00:00Z")
      });
      await createKycCheck({
        investorId,
        reviewedByStaffId: admin.profile.id,
        result: "review",
        reviewedAt: new Date("2026-02-01T00:00:00Z")
      });

      expect(await confirmInterest({ interestId: interest.id })).toEqual({
        ok: false,
        error: "AML screening not clear. Record a clear sanctions/PEP screening before confirming."
      });
      expect((await getInterest(interest.id))?.status).toBe("pending");
      const blockedHoldings = await db
        .select()
        .from(holdings)
        .where(eq(holdings.interestId, interest.id));
      expect(blockedHoldings).toHaveLength(0);

      // A newer clear screening (latest-of-many) re-enables the confirm.
      await createKycCheck({
        investorId,
        reviewedByStaffId: admin.profile.id,
        result: "clear",
        reviewedAt: new Date("2026-03-01T00:00:00Z")
      });
      expect(await confirmInterest({ interestId: interest.id })).toEqual({ ok: true });
      expect((await getInterest(interest.id))?.status).toBe("confirmed");
    });

    it("gates on the LATEST screening when the newest row is rejected", async () => {
      const investorFixture = await makeInvestor({ kycStatus: "approved" });
      const asset = await createAsset();
      const interest = await createInterestRow({
        investorId: investorFixture.investor.id,
        assetId: asset.id
      });
      const investorId = investorFixture.investor.id;

      await createKycCheck({
        investorId,
        reviewedByStaffId: admin.profile.id,
        result: "clear",
        reviewedAt: new Date("2026-01-01T00:00:00Z")
      });
      await createKycCheck({
        investorId,
        reviewedByStaffId: admin.profile.id,
        result: "rejected",
        reviewedAt: new Date("2026-02-01T00:00:00Z")
      });

      expect(await confirmInterest({ interestId: interest.id })).toEqual({
        ok: false,
        error: "AML screening not clear. Record a clear sanctions/PEP screening before confirming."
      });
      expect((await getInterest(interest.id))?.status).toBe("pending");
    });

    it("blocks confirming into an asset that was closed after the interest", async () => {
      const { asset, interest } = await makePendingInterest();
      await db.update(assets).set({ status: "closed" }).where(eq(assets.id, asset.id));

      const result = await confirmInterest({ interestId: interest.id });

      expect(result).toEqual({
        ok: false,
        error: "This asset is no longer open for investment, so this interest can no longer be confirmed."
      });
      expect((await getInterest(interest.id))?.status).toBe("pending");
      const rows = await db.select().from(holdings).where(eq(holdings.interestId, interest.id));
      expect(rows).toHaveLength(0);
    });

    it("blocks confirming a ticket that would push the asset past its stated capacity", async () => {
      const { asset, interest } = await makePendingInterest(); // 30,000 ticket
      await db.update(assets).set({ advisoryCapacityEur: 40_000 }).where(eq(assets.id, asset.id));
      // 20,000 already committed in an active holding; 20,000 + 30,000 > 40,000.
      const otherInvestor = await makeInvestor({ kycStatus: "approved" });
      const otherInterest = await createInterestRow({
        investorId: otherInvestor.investor.id,
        assetId: asset.id,
        amountEur: 20_000,
        status: "confirmed"
      });
      await createHolding({
        investorId: otherInvestor.investor.id,
        assetId: asset.id,
        interestId: otherInterest.id,
        amountEur: 20_000
      });

      const result = await confirmInterest({ interestId: interest.id });

      expect(result).toEqual({
        ok: false,
        error: "Confirming this interest would exceed the asset's stated capacity."
      });
      expect((await getInterest(interest.id))?.status).toBe("pending");
      const rows = await db.select().from(holdings).where(eq(holdings.interestId, interest.id));
      expect(rows).toHaveLength(0);
    });

    it("scopes confirmation to staff whose book contains the investor", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const otherIb = await makeIb();
      const otherAgent = await makeAgent(otherIb);

      const inBook = await makePendingInterest({ ib, agent });
      signInAs(otherAgent.authUser);
      expect(await confirmInterest({ interestId: inBook.interest.id })).toEqual({
        ok: false,
        error: "You do not have access to this investor's interest."
      });

      signInAs(otherIb.authUser);
      expect(await confirmInterest({ interestId: inBook.interest.id })).toEqual({
        ok: false,
        error: "You do not have access to this investor's interest."
      });

      signInAs(agent.authUser);
      expect(await confirmInterest({ interestId: inBook.interest.id })).toEqual({ ok: true });

      const ibBook = await makePendingInterest({ ib, agent });
      signInAs(ib.authUser);
      expect(await confirmInterest({ interestId: ibBook.interest.id })).toEqual({ ok: true });
    });
  });

  describe("declineInterest (ops)", () => {
    it("declines a pending interest and audits it; a second decision fails", async () => {
      const { investor } = await makeInvestor({ kycStatus: "not_started" });
      const asset = await createAsset();
      const interest = await createInterestRow({
        investorId: investor.id,
        assetId: asset.id
      });

      const result = await declineInterest({
        interestId: interest.id,
        adminNote: "Ticket size below current allocation."
      });

      expect(result).toEqual({ ok: true });
      const decided = await getInterest(interest.id);
      expect(decided?.status).toBe("declined");
      expect(decided?.decidedBy).toBe(admin.authUser.id);
      const audit = await listAuditEvents("interest.declined", interest.id);
      expect(audit).toHaveLength(1);

      expect(await declineInterest({ interestId: interest.id })).toEqual({
        ok: false,
        error: "This interest is already declined and can no longer be declined."
      });
    });
  });
});

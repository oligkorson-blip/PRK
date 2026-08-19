/**
 * Integration tests for lib/portfolio/admin-distributions.ts — recording
 * distributions and the scoped listing queries — against a real Postgres
 * scratch database. Only the session is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { postgresErrorCode } from "@/lib/db/errors";

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
import { recordDistribution } from "@/lib/portfolio/admin-distributions";
import { listRecentDistributions } from "@/lib/portfolio/queries";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  createAsset,
  createHolding,
  createInterestRow,
  createInvestor,
  createStaff,
  db,
  distributions,
  listAuditEvents,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(u: { id: string; email: string } | null) {
  sessionState.user = u;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;
type Holding = Awaited<ReturnType<typeof createHolding>>;

describeIntegration("portfolio distributions (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;

  async function makeIb() {
    return createStaff({ email: uniqEmail("ib"), role: "ib" });
  }
  async function makeAgent(ib: Staff) {
    return createStaff({ email: uniqEmail("agent"), role: "agent", ibId: ib.profile.id });
  }

  /** Investor + active holding, optionally placed in a staff book. */
  async function makeHolding(overrides?: {
    ibId?: string | null;
    assignedAgentId?: string | null;
    holdingStatus?: "active" | "closed";
  }) {
    const { investor } = await createInvestor({
      email: uniqEmail("inv"),
      ibId: overrides?.ibId ?? null,
      assignedAgentId: overrides?.assignedAgentId ?? null
    });
    const asset = await createAsset();
    const interest = await createInterestRow({
      investorId: investor.id,
      assetId: asset.id,
      status: "confirmed"
    });
    const holding = await createHolding({
      investorId: investor.id,
      assetId: asset.id,
      interestId: interest.id,
      status: overrides?.holdingStatus ?? "active"
    });
    return { investor, asset, holding };
  }

  async function getDistribution(id: string) {
    const [row] = await db.select().from(distributions).where(eq(distributions.id, id)).limit(1);
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

  beforeEach(() => {
    signInAs(admin.authUser);
  });

  describe("recordDistribution", () => {
    it("records a paid income distribution with defaults and audits it", async () => {
      const { investor, holding } = await makeHolding();

      const result = await recordDistribution({
        holdingId: holding.id,
        amountEur: 125,
        periodLabel: "2026-07"
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const row = await getDistribution(result.id!);
      expect(row).toMatchObject({
        investorId: investor.id,
        holdingId: holding.id,
        amountEur: 125,
        type: "income",
        status: "paid",
        periodLabel: "2026-07"
      });
      expect(row?.paidAt).not.toBeNull();

      const audit = await listAuditEvents("distribution.recorded", result.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({
        holdingId: holding.id,
        investorId: investor.id,
        amountEur: 125,
        type: "income",
        status: "paid"
      });
    });

    it("keeps paidAt null for scheduled distributions", async () => {
      const { holding } = await makeHolding();

      const result = await recordDistribution({
        holdingId: holding.id,
        amountEur: 200,
        status: "scheduled",
        periodLabel: "2026-07"
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect((await getDistribution(result.id!))?.paidAt).toBeNull();
    });

    it("scopes recording to staff whose book contains the investor", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const otherIb = await makeIb();
      const otherAgent = await makeAgent(otherIb);
      const inBook = await makeHolding({
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });

      signInAs(otherAgent.authUser);
      expect(await recordDistribution({ holdingId: inBook.holding.id, amountEur: 50, periodLabel: "scope-agent-denied" })).toEqual({
        ok: false,
        error: "You do not have access to this investor."
      });

      signInAs(otherIb.authUser);
      expect(await recordDistribution({ holdingId: inBook.holding.id, amountEur: 50, periodLabel: "scope-ib-denied" })).toEqual({
        ok: false,
        error: "You do not have access to this investor."
      });

      signInAs(agent.authUser);
      expect((await recordDistribution({ holdingId: inBook.holding.id, amountEur: 50, periodLabel: "scope-agent" })).ok).toBe(
        true
      );

      signInAs(ib.authUser);
      expect((await recordDistribution({ holdingId: inBook.holding.id, amountEur: 60, periodLabel: "scope-ib" })).ok).toBe(
        true
      );
    });

    it("validates amount, holding status, and paid date", async () => {
      const active = await makeHolding();
      const closed = await makeHolding({ holdingStatus: "closed" });

      expect(await recordDistribution({ holdingId: active.holding.id, amountEur: 0 })).toEqual({
        ok: false,
        error: "Amount must be a positive whole number in EUR."
      });
      expect(
        await recordDistribution({ holdingId: active.holding.id, amountEur: 10.5 })
      ).toEqual({ ok: false, error: "Amount must be a positive whole number in EUR." });
      expect(
        await recordDistribution({ holdingId: active.holding.id, amountEur: 10_000_001 })
      ).toEqual({ ok: false, error: "Amount looks too large. Check the figure." });
      expect(await recordDistribution({ holdingId: closed.holding.id, amountEur: 100 })).toEqual({
        ok: false,
        error: "Only active investments can receive distributions."
      });
      expect(
        await recordDistribution({
          holdingId: active.holding.id,
          amountEur: 100,
          periodLabel: "invalid-date",
          paidAt: "not-a-date"
        })
      ).toEqual({ ok: false, error: "Paid date is invalid." });
      expect(
        await recordDistribution({ holdingId: active.holding.id, amountEur: 100, periodLabel: "x".repeat(81) })
      ).toEqual({ ok: false, error: "Payment reference is too long." });
    });

    it("is idempotent under a retry: identical input returns the original row, once", async () => {
      const { holding } = await makeHolding();
      const input = { holdingId: holding.id, amountEur: 125, periodLabel: "2026-07" };

      const first = await recordDistribution(input);
      const second = await recordDistribution(input);

      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.id).toBe(first.id);

      const rows = await db
        .select()
        .from(distributions)
        .where(eq(distributions.holdingId, holding.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].idempotencyKey).not.toBeNull();

      // The duplicate posting wrote no second audit row.
      const audit = await listAuditEvents("distribution.recorded", first.id);
      expect(audit).toHaveLength(1);
    });

    it("records a separate row when a business field differs", async () => {
      const { holding } = await makeHolding();

      const first = await recordDistribution({
        holdingId: holding.id,
        amountEur: 125,
        periodLabel: "2026-07"
      });
      const second = await recordDistribution({
        holdingId: holding.id,
        amountEur: 125,
        periodLabel: "2026-08"
      });

      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.id).not.toBe(first.id);

      const rows = await db
        .select()
        .from(distributions)
        .where(eq(distributions.holdingId, holding.id));
      expect(rows).toHaveLength(2);
    });
  });

  describe("listRecentDistributions scoping", () => {
    it("shows super_admin everything and staff only their own book", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const inBook = await makeHolding({
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });
      const outOfBook = await makeHolding();

      signInAs(admin.authUser);
      const inDist = await recordDistribution({ holdingId: inBook.holding.id, amountEur: 111, periodLabel: "list-in" });
      const outDist = await recordDistribution({ holdingId: outOfBook.holding.id, amountEur: 222, periodLabel: "list-out" });
      expect(inDist.ok && outDist.ok).toBe(true);
      if (!inDist.ok || !outDist.ok) return;

      const asAdmin = await listRecentDistributions();
      const adminIds = asAdmin.map((r) => r.id);
      expect(adminIds).toContain(inDist.id);
      expect(adminIds).toContain(outDist.id);

      signInAs(agent.authUser);
      const asAgent = await listRecentDistributions();
      const agentIds = asAgent.map((r) => r.id);
      expect(agentIds).toContain(inDist.id);
      expect(agentIds).not.toContain(outDist.id);

      signInAs(ib.authUser);
      const asIb = await listRecentDistributions();
      const ibIds = asIb.map((r) => r.id);
      expect(ibIds).toContain(inDist.id);
      expect(ibIds).not.toContain(outDist.id);
    });

    it("applies the limit to in-scope rows, not to the global recent set", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const inBook = await makeHolding({
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });

      signInAs(admin.authUser);
      const inA = await recordDistribution({
        holdingId: inBook.holding.id,
        amountEur: 101,
        periodLabel: "p1"
      });
      const inB = await recordDistribution({
        holdingId: inBook.holding.id,
        amountEur: 102,
        periodLabel: "p2"
      });
      // Newer out-of-book records would consume the LIMIT if scoping ran in JS.
      for (let i = 0; i < 3; i++) {
        const out = await makeHolding();
        await recordDistribution({ holdingId: out.holding.id, amountEur: 500 + i, periodLabel: `out-${i}` });
      }
      expect(inA.ok && inB.ok).toBe(true);
      if (!inA.ok || !inB.ok) return;

      signInAs(agent.authUser);
      const rows = await listRecentDistributions(3);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(inA.id);
      expect(ids).toContain(inB.id);
    });
  });

  describe("distributions table constraints (real SQL)", () => {
    it("enforces the idempotency-key unique index", async () => {
      const { investor, holding } = await makeHolding();
      const key = `it-${Date.now()}`;
      await db.insert(distributions).values({
        investorId: investor.id,
        holdingId: holding.id,
        amountEur: 10,
        idempotencyKey: key
      });

      await expect(
        db.insert(distributions).values({
          investorId: investor.id,
          holdingId: holding.id,
          amountEur: 10,
          idempotencyKey: key
        })
      ).rejects.toSatisfy((e) => postgresErrorCode(e) === "23505");
    });

    it("enforces the positive-amount CHECK", async () => {
      const { investor, holding } = await makeHolding();

      await expect(
        db.insert(distributions).values({
          investorId: investor.id,
          holdingId: holding.id,
          amountEur: 0
        })
      ).rejects.toSatisfy((e) => postgresErrorCode(e) === "23514");
    });
  });
});

/**
 * Integration tests for bulkSetLeadStatus (lib/leads/assign/bulk-status.ts)
 * and countStaleLeadsForStaff (lib/leads/queries.ts). Real Postgres scratch
 * database; only the session is mocked.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { bulkSetLeadStatus } from "@/lib/leads/assign/bulk-status";
import { countStaleLeadsForStaff } from "@/lib/leads/queries";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  createInvestor,
  createLead,
  createLeadList,
  createStaff,
  getLead,
  listAuditEvents,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(user: { id: string; email: string } | null) {
  sessionState.user = user;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;

describeIntegration("bulkSetLeadStatus + countStaleLeadsForStaff (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;
  let list: Awaited<ReturnType<typeof createLeadList>>;

  async function makeIbWithAgent() {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const agent = await createStaff({
      email: uniqEmail("agent"),
      role: "agent",
      ibId: ib.profile.id
    });
    return { ib, agent };
  }

  beforeAll(async () => {
    handle = await setupIntegrationDatabase();
    const adminEmail = uniqEmail("sa");
    process.env.SUPER_ADMIN_EMAILS = adminEmail;
    admin = await createStaff({ email: adminEmail, role: "super_admin" });
    list = await createLeadList(admin.profile.id);
  }, 120_000);

  afterAll(async () => {
    await handle?.teardown();
  });

  beforeEach(() => {
    signInAs(admin.authUser);
  });

  it("updates every selected in-scope lead and writes one audit event per row", async () => {
    const { ib, agent } = await makeIbWithAgent();
    const leadA = await createLead({
      listId: list.id,
      email: uniqEmail("a"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });
    const leadB = await createLead({
      listId: list.id,
      email: uniqEmail("b"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });

    signInAs(agent.authUser);
    const result = await bulkSetLeadStatus({
      leadIds: [leadA.id, leadB.id],
      status: "contacted"
    });

    expect(result).toEqual({ ok: true, updated: 2, failed: [] });
    expect((await getLead(leadA.id))?.status).toBe("contacted");
    expect((await getLead(leadB.id))?.status).toBe("contacted");
    expect((await getLead(leadA.id))?.lastActivityAt).not.toBeNull();
    expect(await listAuditEvents("lead.status_changed", leadA.id)).toHaveLength(1);
    expect(await listAuditEvents("lead.status_changed", leadB.id)).toHaveLength(1);
  });

  it("collects per-row errors (partial success) instead of failing silently", async () => {
    const { ib, agent } = await makeIbWithAgent();
    const other = await makeIbWithAgent();
    const own = await createLead({
      listId: list.id,
      email: uniqEmail("own"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });
    const foreign = await createLead({
      listId: list.id,
      email: uniqEmail("foreign"),
      ibId: other.ib.profile.id,
      assignedAgentId: other.agent.profile.id
    });
    const missing = randomUUID();

    signInAs(agent.authUser);
    const result = await bulkSetLeadStatus({
      leadIds: [own.id, foreign.id, missing],
      status: "qualified"
    });

    expect(result).toEqual({
      ok: true,
      updated: 1,
      failed: [
        { leadId: foreign.id, error: "You do not have access to this lead." },
        { leadId: missing, error: "Lead not found." }
      ]
    });
    expect((await getLead(own.id))?.status).toBe("qualified");
    expect((await getLead(foreign.id))?.status).toBe("new");
    expect(await listAuditEvents("lead.status_changed", foreign.id)).toHaveLength(0);
  });

  it("refuses converted leads linked to an investor, per row", async () => {
    const { investor } = await createInvestor({ email: uniqEmail("inv") });
    const converted = await createLead({
      listId: list.id,
      email: uniqEmail("conv"),
      status: "converted",
      investorId: investor.id
    });

    const result = await bulkSetLeadStatus({
      leadIds: [converted.id],
      status: "contacted"
    });

    expect(result).toEqual({
      ok: true,
      updated: 0,
      failed: [
        {
          leadId: converted.id,
          error: "This lead is converted and linked to an investor; its stage cannot be changed."
        }
      ]
    });
    expect((await getLead(converted.id))?.status).toBe("converted");
  });

  it("rejects an invalid status or an empty selection for the whole call", async () => {
    expect(await bulkSetLeadStatus({ leadIds: [randomUUID()], status: "bogus" })).toEqual({
      ok: false,
      error: "Invalid status."
    });
    expect(await bulkSetLeadStatus({ leadIds: [], status: "contacted" })).toEqual({
      ok: false,
      error: "No leads selected."
    });
  });

  it("countStaleLeadsForStaff counts only stale, non-terminal leads in scope", async () => {
    const { ib, agent } = await makeIbWithAgent();
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await createLead({ // stale: non-terminal, 10 days idle
      listId: list.id,
      email: uniqEmail("stale"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id,
      status: "contacted",
      lastActivityAt: daysAgo(10)
    });
    await createLead({ // fresh
      listId: list.id,
      email: uniqEmail("fresh"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id,
      status: "contacted",
      lastActivityAt: daysAgo(2)
    });
    await createLead({ // terminal, old — excluded
      listId: list.id,
      email: uniqEmail("term"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id,
      status: "unqualified",
      lastActivityAt: daysAgo(30)
    });
    await createLead({ // no activity yet — "unworked", not stale
      listId: list.id,
      email: uniqEmail("new"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });

    signInAs(agent.authUser);
    expect(await countStaleLeadsForStaff()).toBe(1);
    expect(await countStaleLeadsForStaff({ assignment: "assigned" })).toBe(1);
    expect(await countStaleLeadsForStaff({ assignment: "unassigned" })).toBe(0);

    // The parent IB sees the same stale lead across queue + team.
    signInAs(ib.authUser);
    expect(await countStaleLeadsForStaff()).toBe(1);
  });
});

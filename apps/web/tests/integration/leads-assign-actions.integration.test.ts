/**
 * Integration tests for lib/leads/assign/ — IB/agent assignment
 * routes, bulk assignment, and the leads CHECK/unique constraints — against a
 * real Postgres scratch database. Only the session is mocked.
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
import {
  assignLeadToAgent,
  assignLeadToIb,
  removeLeadAgent,
  removeLeadAssignment
} from "@/lib/leads/assign/assign";
import { assignAllLeadsInList } from "@/lib/leads/assign/bulk-assign";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  createAuthUser,
  createInvestor,
  createLead,
  createLeadList,
  createStaff,
  db,
  getInvestor,
  getLead,
  leads,
  listAssignmentsForLead,
  listAuditEvents,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(user: { id: string; email: string } | null) {
  sessionState.user = user;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;

describeIntegration("lead assignment actions (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;
  let list: Awaited<ReturnType<typeof createLeadList>>;

  async function makeIb() {
    return createStaff({ email: uniqEmail("ib"), role: "ib" });
  }
  async function makeAgent(ib: Staff) {
    return createStaff({ email: uniqEmail("agent"), role: "agent", ibId: ib.profile.id });
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

  describe("assignLeadToIb (super_admin only)", () => {
    it("routes a lead to an IB queue and logs the assignment", async () => {
      const ib = await makeIb();
      const lead = await createLead({ listId: list.id });

      const result = await assignLeadToIb({ leadId: lead.id, ibStaffId: ib.profile.id });

      expect(result).toEqual({ ok: true });
      const updated = await getLead(lead.id);
      expect(updated?.ibId).toBe(ib.profile.id);
      expect(updated?.assignedAgentId).toBeNull();
      expect(updated?.assignedByStaffId).toBe(admin.profile.id);

      const log = await listAssignmentsForLead(lead.id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        action: "assign_ib",
        fromIbId: null,
        toIbId: ib.profile.id
      });
      const audit = await listAuditEvents("lead.assign_ib", lead.id);
      expect(audit).toHaveLength(1);
    });

    it("syncs the linked investor and records original attribution once", async () => {
      const ib = await makeIb();
      const otherIb = await makeIb();
      const { investor } = await createInvestor({ email: uniqEmail("inv") });
      const lead = await createLead({ listId: list.id, investorId: investor.id });

      expect(await assignLeadToIb({ leadId: lead.id, ibStaffId: ib.profile.id })).toEqual({
        ok: true
      });
      let synced = await getInvestor(investor.id);
      expect(synced?.ibId).toBe(ib.profile.id);
      expect(synced?.originalIbId).toBe(ib.profile.id);

      // Reassigning later must not overwrite first-touch attribution.
      expect(await assignLeadToIb({ leadId: lead.id, ibStaffId: otherIb.profile.id })).toEqual({
        ok: true
      });
      synced = await getInvestor(investor.id);
      expect(synced?.ibId).toBe(otherIb.profile.id);
      expect(synced?.originalIbId).toBe(ib.profile.id);

      const log = await listAssignmentsForLead(lead.id);
      expect(log[0].action).toBe("reassign_ib");
    });

    it("rejects IB, agent, and non-staff callers", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const lead = await createLead({ listId: list.id });

      signInAs(ib.authUser);
      expect(await assignLeadToIb({ leadId: lead.id, ibStaffId: ib.profile.id })).toEqual({
        ok: false,
        error: "Forbidden."
      });

      signInAs(agent.authUser);
      expect(await assignLeadToIb({ leadId: lead.id, ibStaffId: ib.profile.id })).toEqual({
        ok: false,
        error: "Forbidden."
      });

      const plain = await createAuthUser(uniqEmail("plain"));
      signInAs(plain);
      expect(await assignLeadToIb({ leadId: lead.id, ibStaffId: ib.profile.id })).toEqual({
        ok: false,
        error: "Forbidden."
      });
    });
  });

  describe("assignLeadToAgent (super_admin or owning IB)", () => {
    it("lets the owning IB assign a queue lead to an agent on its own team", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const { investor } = await createInvestor({ email: uniqEmail("inv"), ibId: ib.profile.id });
      const lead = await createLead({
        listId: list.id,
        ibId: ib.profile.id,
        investorId: investor.id
      });

      signInAs(ib.authUser);
      const result = await assignLeadToAgent({ leadId: lead.id, agentStaffId: agent.profile.id });

      expect(result).toEqual({ ok: true });
      const updated = await getLead(lead.id);
      expect(updated?.assignedAgentId).toBe(agent.profile.id);
      expect(updated?.ibId).toBe(ib.profile.id);
      expect(updated?.assignedByStaffId).toBe(ib.profile.id);

      const synced = await getInvestor(investor.id);
      expect(synced?.assignedAgentId).toBe(agent.profile.id);
      expect(synced?.originalAgentId).toBe(agent.profile.id);

      const log = await listAssignmentsForLead(lead.id);
      expect(log[0]).toMatchObject({
        action: "assign_agent",
        actorStaffId: ib.profile.id,
        toAgentId: agent.profile.id
      });
    });

    it("denies an IB leads outside its book and agents outside its team", async () => {
      const ib = await makeIb();
      const otherIb = await makeIb();
      const otherAgent = await makeAgent(otherIb);
      const foreignLead = await createLead({ listId: list.id, ibId: otherIb.profile.id });
      const ownLead = await createLead({ listId: list.id, ibId: ib.profile.id });

      signInAs(ib.authUser);
      expect(
        await assignLeadToAgent({ leadId: foreignLead.id, agentStaffId: otherAgent.profile.id })
      ).toEqual({ ok: false, error: "This lead is not in your team's book." });
      expect(
        await assignLeadToAgent({ leadId: ownLead.id, agentStaffId: otherAgent.profile.id })
      ).toEqual({
        ok: false,
        error: "You can only assign leads to agents on your own team."
      });
    });

    it("rejects plain agents and lets super_admin assign across teams", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const lead = await createLead({ listId: list.id });

      signInAs(agent.authUser);
      expect(
        await assignLeadToAgent({ leadId: lead.id, agentStaffId: agent.profile.id })
      ).toEqual({ ok: false, error: "Forbidden." });

      signInAs(admin.authUser);
      expect(
        await assignLeadToAgent({ leadId: lead.id, agentStaffId: agent.profile.id })
      ).toEqual({ ok: true });
      expect((await getLead(lead.id))?.ibId).toBe(ib.profile.id);
    });
  });

  describe("removeLeadAgent / removeLeadAssignment", () => {
    it("returns a lead to the IB queue for the owning IB", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const lead = await createLead({
        listId: list.id,
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });

      signInAs(ib.authUser);
      expect(await removeLeadAgent({ leadId: lead.id })).toEqual({ ok: true });

      const updated = await getLead(lead.id);
      expect(updated?.assignedAgentId).toBeNull();
      expect(updated?.ibId).toBe(ib.profile.id);
      const log = await listAssignmentsForLead(lead.id);
      expect(log[0]).toMatchObject({ action: "return_to_ib_queue", toAgentId: null });
    });

    it("denies other IBs and clears fully for super_admin only", async () => {
      const ib = await makeIb();
      const otherIb = await makeIb();
      const agent = await makeAgent(ib);
      const lead = await createLead({
        listId: list.id,
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });

      signInAs(otherIb.authUser);
      expect(await removeLeadAgent({ leadId: lead.id })).toEqual({
        ok: false,
        error: "This lead is not in your team's book."
      });
      expect(await removeLeadAssignment({ leadId: lead.id })).toEqual({
        ok: false,
        error: "Forbidden."
      });

      signInAs(admin.authUser);
      expect(await removeLeadAssignment({ leadId: lead.id })).toEqual({ ok: true });
      const updated = await getLead(lead.id);
      expect(updated?.ibId).toBeNull();
      expect(updated?.assignedAgentId).toBeNull();
      const log = await listAssignmentsForLead(lead.id);
      expect(log[0]).toMatchObject({ action: "remove_all", toIbId: null, toAgentId: null });
    });
  });

  describe("assignAllLeadsInList", () => {
    it("assigns every lead in the list to an IB in one batch", async () => {
      const ib = await makeIb();
      const bulkList = await createLeadList(admin.profile.id);
      const leadA = await createLead({ listId: bulkList.id });
      const leadB = await createLead({ listId: bulkList.id });

      const result = await assignAllLeadsInList({ listId: bulkList.id, ibStaffId: ib.profile.id });

      expect(result).toEqual({ ok: true });
      expect((await getLead(leadA.id))?.ibId).toBe(ib.profile.id);
      expect((await getLead(leadB.id))?.ibId).toBe(ib.profile.id);
      expect(await listAssignmentsForLead(leadA.id)).toHaveLength(1);
      expect(await listAssignmentsForLead(leadB.id)).toHaveLength(1);
    });

    it("unassignAll skips already-unassigned leads instead of failing", async () => {
      const ib = await makeIb();
      const bulkList = await createLeadList(admin.profile.id);
      const assigned = await createLead({ listId: bulkList.id, ibId: ib.profile.id });
      const alreadyClear = await createLead({ listId: bulkList.id });

      const result = await assignAllLeadsInList({ listId: bulkList.id, unassignAll: true });

      expect(result).toEqual({ ok: true });
      expect((await getLead(assigned.id))?.ibId).toBeNull();
      expect((await getLead(alreadyClear.id))?.ibId).toBeNull();
    });

    it("rejects non-super-admin callers", async () => {
      const ib = await makeIb();
      signInAs(ib.authUser);
      expect(await assignAllLeadsInList({ listId: list.id, ibStaffId: ib.profile.id })).toEqual({
        ok: false,
        error: "Forbidden."
      });
    });
  });

  describe("leads table constraints (real SQL)", () => {
    it("enforces leads_agent_requires_ib: an agent without a parent IB is rejected", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const lead = await createLead({ listId: list.id, ibId: ib.profile.id });

      await expect(
        db
          .update(leads)
          .set({ assignedAgentId: agent.profile.id, ibId: null })
          .where(eq(leads.id, lead.id))
      ).rejects.toSatisfy((e) => postgresErrorCode(e) === "23514");
    });

    it("enforces leads_list_email_lower_uidx case-insensitively", async () => {
      const email = uniqEmail("dup");
      await createLead({ listId: list.id, email });

      await expect(
        db.insert(leads).values({
          listId: list.id,
          fullName: "Duplicate",
          email: email.toUpperCase(),
          source: "csv"
        })
      ).rejects.toSatisfy((e) => postgresErrorCode(e) === "23505");
    });
  });
});

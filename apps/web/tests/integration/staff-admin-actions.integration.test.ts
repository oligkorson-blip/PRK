/**
 * Integration tests for the lib/staff/ promote / transfer / demote action
 * modules — against a real Postgres scratch database. Only the session
 * is mocked (per role under test); staff-context resolution, transactions,
 * unique constraints, and audit writes all run for real.
 *
 * Fixtures that an action mutates (agents, IBs, leads, investors) are created
 * fresh per test — transfers and demotions rewrite ownership by design.
 */
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

import { promoteToAgent, promoteToIb } from "@/lib/staff/promote-actions";
import { transferAgentToIb } from "@/lib/staff/transfer-actions";
import { demoteAgent, demoteIb } from "@/lib/staff/demote-actions";
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
  getInvestor,
  getLead,
  getStaffProfile,
  getStaffProfileByAuthUserId,
  listAssignmentsForLead,
  listAuditEvents,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(user: { id: string; email: string } | null) {
  sessionState.user = user;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;

describeIntegration("staff admin actions (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;
  let secondAdmin: Staff;
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
    const secondAdminEmail = uniqEmail("sa2");
    // SUPER_ADMIN_EMAILS is the sole authority for the super_admin role.
    process.env.SUPER_ADMIN_EMAILS = `${adminEmail},${secondAdminEmail}`;

    admin = await createStaff({ email: adminEmail, role: "super_admin" });
    secondAdmin = await createStaff({ email: secondAdminEmail, role: "super_admin" });
    list = await createLeadList(admin.profile.id);
  }, 120_000);

  afterAll(async () => {
    await handle?.teardown();
  });

  beforeEach(() => {
    signInAs(admin.authUser);
  });

  describe("promoteToIb", () => {
    it("promotes a signed-up user to IB and audits it", async () => {
      const target = await createAuthUser(uniqEmail("newib"));

      const result = await promoteToIb({ email: target.email });

      expect(result).toEqual({ ok: true });
      const profile = await getStaffProfileByAuthUserId(target.id);
      expect(profile?.role).toBe("ib");
      expect(profile?.ibId).toBeNull();
      const audit = await listAuditEvents("staff.promoted", profile!.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].actorUserId).toBe(admin.authUser.id);
      expect(audit[0].payload).toMatchObject({ email: target.email, role: "ib" });
    });

    it("rejects callers who are not super_admin (agent, IB, non-staff)", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);

      signInAs(agent.authUser);
      expect(await promoteToIb({ email: uniqEmail("t") })).toEqual({ ok: false, error: "Forbidden." });

      signInAs(ib.authUser);
      expect(await promoteToIb({ email: uniqEmail("t") })).toEqual({ ok: false, error: "Forbidden." });

      const plainUser = await createAuthUser(uniqEmail("plain"));
      signInAs(plainUser);
      expect(await promoteToIb({ email: uniqEmail("t") })).toEqual({ ok: false, error: "Forbidden." });
    });

    it("rejects invalid emails, unknown users, and super admin targets", async () => {
      expect(await promoteToIb({ email: "not-an-email" })).toEqual({
        ok: false,
        error: "Enter a valid email address."
      });
      expect(await promoteToIb({ email: uniqEmail("ghost") })).toEqual({
        ok: false,
        error: "No signed-up user with that email. They must create an account first."
      });
      expect(await promoteToIb({ email: admin.authUser.email })).toEqual({
        ok: false,
        error: "That email is a super admin and cannot be promoted to IB."
      });
    });
  });

  describe("promoteToAgent", () => {
    it("promotes a user to agent under the given IB", async () => {
      const ib = await makeIb();
      const target = await createAuthUser(uniqEmail("newagent"));

      const result = await promoteToAgent({ email: target.email, ibStaffId: ib.profile.id });

      expect(result).toEqual({ ok: true });
      const profile = await getStaffProfileByAuthUserId(target.id);
      expect(profile?.role).toBe("agent");
      expect(profile?.ibId).toBe(ib.profile.id);
    });

    it("requires a real IB and refuses to re-promote an existing IB", async () => {
      const ib = await makeIb();
      const target = await createAuthUser(uniqEmail("newagent"));
      // admin's profile exists but has the super_admin role, not ib.
      expect(
        await promoteToAgent({ email: target.email, ibStaffId: admin.profile.id })
      ).toEqual({ ok: false, error: "IB not found." });

      const ibTarget = await createAuthUser(uniqEmail("ibfirst"));
      expect(await promoteToIb({ email: ibTarget.email })).toEqual({ ok: true });
      expect(
        await promoteToAgent({ email: ibTarget.email, ibStaffId: ib.profile.id })
      ).toEqual({ ok: false, error: "That user is an IB. Demote them from IB first." });
    });

    it("rejects non-super-admin callers", async () => {
      const ib = await makeIb();
      const target = await createAuthUser(uniqEmail("newagent"));
      signInAs(ib.authUser);
      expect(
        await promoteToAgent({ email: target.email, ibStaffId: ib.profile.id })
      ).toEqual({ ok: false, error: "Forbidden." });
    });
  });

  describe("transferAgentToIb", () => {
    it("moves the agent, their leads, and their investors with move_with_agent", async () => {
      const fromIb = await makeIb();
      const toIb = await makeIb();
      const agent = await makeAgent(fromIb);
      const { investor } = await createInvestor({
        email: uniqEmail("inv"),
        ibId: fromIb.profile.id,
        assignedAgentId: agent.profile.id
      });
      const lead = await createLead({
        listId: list.id,
        ibId: fromIb.profile.id,
        assignedAgentId: agent.profile.id,
        investorId: investor.id
      });

      const result = await transferAgentToIb({
        agentStaffId: agent.profile.id,
        toIbStaffId: toIb.profile.id,
        leadStrategy: "move_with_agent"
      });

      expect(result).toEqual({ ok: true });
      expect((await getStaffProfile(agent.profile.id))?.ibId).toBe(toIb.profile.id);
      const movedLead = await getLead(lead.id);
      expect(movedLead?.ibId).toBe(toIb.profile.id);
      expect(movedLead?.assignedAgentId).toBe(agent.profile.id);
      expect((await getInvestor(investor.id))?.ibId).toBe(toIb.profile.id);

      const log = await listAssignmentsForLead(lead.id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        action: "reassign_ib",
        fromIbId: fromIb.profile.id,
        toIbId: toIb.profile.id,
        fromAgentId: agent.profile.id,
        toAgentId: agent.profile.id
      });
      const audit = await listAuditEvents("staff.agent_transferred", agent.profile.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({
        fromIbStaffId: fromIb.profile.id,
        toIbStaffId: toIb.profile.id,
        leadStrategy: "move_with_agent"
      });
    });

    it("returns leads to the original IB queue with keep_with_original_ib", async () => {
      const fromIb = await makeIb();
      const toIb = await makeIb();
      const agent = await makeAgent(fromIb);
      const { investor } = await createInvestor({
        email: uniqEmail("inv"),
        ibId: fromIb.profile.id,
        assignedAgentId: agent.profile.id
      });
      const lead = await createLead({
        listId: list.id,
        ibId: fromIb.profile.id,
        assignedAgentId: agent.profile.id,
        investorId: investor.id
      });

      const result = await transferAgentToIb({
        agentStaffId: agent.profile.id,
        toIbStaffId: toIb.profile.id,
        leadStrategy: "keep_with_original_ib"
      });

      expect(result).toEqual({ ok: true });
      expect((await getStaffProfile(agent.profile.id))?.ibId).toBe(toIb.profile.id);
      const keptLead = await getLead(lead.id);
      expect(keptLead?.ibId).toBe(fromIb.profile.id);
      expect(keptLead?.assignedAgentId).toBeNull();
      const keptInvestor = await getInvestor(investor.id);
      expect(keptInvestor?.ibId).toBe(fromIb.profile.id);
      expect(keptInvestor?.assignedAgentId).toBeNull();

      const log = await listAssignmentsForLead(lead.id);
      expect(log[0]).toMatchObject({ action: "return_to_ib_queue", toAgentId: null });
    });

    it("refuses a transfer to the agent's current IB and non-super-admin callers", async () => {
      const fromIb = await makeIb();
      const toIb = await makeIb();
      const agent = await makeAgent(fromIb);

      expect(
        await transferAgentToIb({
          agentStaffId: agent.profile.id,
          toIbStaffId: fromIb.profile.id,
          leadStrategy: "move_with_agent"
        })
      ).toEqual({ ok: false, error: "That agent is already on this IB's team." });

      signInAs(fromIb.authUser);
      expect(
        await transferAgentToIb({
          agentStaffId: agent.profile.id,
          toIbStaffId: toIb.profile.id,
          leadStrategy: "move_with_agent"
        })
      ).toEqual({ ok: false, error: "Forbidden." });
    });
  });

  describe("demoteAgent", () => {
    it("reassigns leads and investors to a teammate and soft-deletes the agent", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const teammate = await makeAgent(ib);
      const { investor } = await createInvestor({
        email: uniqEmail("inv"),
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });
      const lead = await createLead({
        listId: list.id,
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id,
        investorId: investor.id
      });

      const result = await demoteAgent({
        staffId: agent.profile.id,
        leadStrategy: { reassignToAgentId: teammate.profile.id }
      });

      expect(result).toEqual({ ok: true });
      const movedLead = await getLead(lead.id);
      expect(movedLead?.assignedAgentId).toBe(teammate.profile.id);
      expect(movedLead?.ibId).toBe(ib.profile.id);
      const movedInvestor = await getInvestor(investor.id);
      expect(movedInvestor?.assignedAgentId).toBe(teammate.profile.id);
      expect(movedInvestor?.ibId).toBe(ib.profile.id);
      expect((await getStaffProfile(agent.profile.id))?.deactivatedAt).not.toBeNull();

      const log = await listAssignmentsForLead(lead.id);
      expect(log[0]).toMatchObject({
        action: "reassign_agent",
        fromAgentId: agent.profile.id,
        toAgentId: teammate.profile.id
      });
      const audit = await listAuditEvents("staff.demoted", agent.profile.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({ leadStrategy: "reassign", leadCount: 1 });

      // A deactivated agent can no longer act.
      signInAs(agent.authUser);
      expect(await promoteToIb({ email: uniqEmail("t") })).toEqual({
        ok: false,
        error: "Forbidden."
      });
    });

    it("returns leads to the IB queue with return_to_ib_queue", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const lead = await createLead({
        listId: list.id,
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });

      const result = await demoteAgent({
        staffId: agent.profile.id,
        leadStrategy: "return_to_ib_queue"
      });

      expect(result).toEqual({ ok: true });
      const queued = await getLead(lead.id);
      expect(queued?.assignedAgentId).toBeNull();
      expect(queued?.ibId).toBe(ib.profile.id);
      const log = await listAssignmentsForLead(lead.id);
      expect(log[0]).toMatchObject({ action: "return_to_ib_queue", toAgentId: null });
    });

    it("fully unassigns leads and investors with unassign_all", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const { investor } = await createInvestor({
        email: uniqEmail("inv"),
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });
      const lead = await createLead({
        listId: list.id,
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });

      const result = await demoteAgent({
        staffId: agent.profile.id,
        leadStrategy: "unassign_all"
      });

      expect(result).toEqual({ ok: true });
      const cleared = await getLead(lead.id);
      expect(cleared?.assignedAgentId).toBeNull();
      expect(cleared?.ibId).toBeNull();
      const clearedInvestor = await getInvestor(investor.id);
      expect(clearedInvestor?.assignedAgentId).toBeNull();
      expect(clearedInvestor?.ibId).toBeNull();
      const log = await listAssignmentsForLead(lead.id);
      expect(log[0]).toMatchObject({ action: "remove_all", toIbId: null, toAgentId: null });
    });

    it("rejects cross-IB reassignment targets, self-demotion, and super admins", async () => {
      const ib = await makeIb();
      const otherIb = await makeIb();
      const agent = await makeAgent(ib);
      const crossIbAgent = await makeAgent(otherIb);

      expect(
        await demoteAgent({
          staffId: agent.profile.id,
          leadStrategy: { reassignToAgentId: crossIbAgent.profile.id }
        })
      ).toEqual({
        ok: false,
        error: "Leads can only be reassigned to an agent under the same IB."
      });

      expect(
        await demoteAgent({ staffId: admin.profile.id, leadStrategy: "unassign_all" })
      ).toEqual({ ok: false, error: "You cannot remove your own staff access." });

      expect(
        await demoteAgent({ staffId: secondAdmin.profile.id, leadStrategy: "unassign_all" })
      ).toEqual({ ok: false, error: "Super admins cannot be demoted here." });
    });
  });

  describe("demoteIb", () => {
    it("moves the whole team to another IB and soft-deletes the IB", async () => {
      const teamIb = await makeIb();
      const targetIb = await makeIb();
      const teamAgent = await makeAgent(teamIb);
      const { investor } = await createInvestor({
        email: uniqEmail("inv"),
        ibId: teamIb.profile.id,
        assignedAgentId: teamAgent.profile.id
      });
      const lead = await createLead({
        listId: list.id,
        ibId: teamIb.profile.id,
        assignedAgentId: teamAgent.profile.id,
        investorId: investor.id
      });

      const result = await demoteIb({
        staffId: teamIb.profile.id,
        teamStrategy: { reassignTeamToIbId: targetIb.profile.id }
      });

      expect(result).toEqual({ ok: true });
      expect((await getStaffProfile(teamAgent.profile.id))?.ibId).toBe(targetIb.profile.id);
      expect((await getLead(lead.id))?.ibId).toBe(targetIb.profile.id);
      expect((await getInvestor(investor.id))?.ibId).toBe(targetIb.profile.id);
      expect((await getStaffProfile(teamIb.profile.id))?.deactivatedAt).not.toBeNull();

      const log = await listAssignmentsForLead(lead.id);
      expect(log[0]).toMatchObject({
        action: "reassign_ib",
        fromIbId: teamIb.profile.id,
        toIbId: targetIb.profile.id
      });
      const audit = await listAuditEvents("staff.ib_demoted", teamIb.profile.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({ teamReassignedToIbId: targetIb.profile.id });
    });

    it("refuses to reassign the team to the IB being removed", async () => {
      const teamIb = await makeIb();
      expect(
        await demoteIb({
          staffId: teamIb.profile.id,
          teamStrategy: { reassignTeamToIbId: teamIb.profile.id }
        })
      ).toEqual({ ok: false, error: "Cannot reassign the team to the IB being removed." });
    });
  });
});

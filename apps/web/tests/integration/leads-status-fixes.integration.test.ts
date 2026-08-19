/**
 * Integration tests for the leads correctness fixes (spec A.4):
 *  - setLeadStatus refuses to move a lead out of `converted` when investorId is set
 *  - the IB "Unassigned leads" queue excludes terminal statuses
 *  - getLeadForStaff loads one lead with role scoping and no existence oracle
 *  - updateLeadDetails handles email unique-collisions and audits old/new email
 * Real Postgres scratch database; only the session is mocked.
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

import { setLeadStatus } from "@/lib/leads/assign/status";
import { updateLeadDetails } from "@/lib/leads/assign/details";
import { getLeadForStaff, searchLeadsForStaff } from "@/lib/leads/queries";
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

describeIntegration("leads correctness fixes (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;
  let list: Awaited<ReturnType<typeof createLeadList>>;

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

  describe("setLeadStatus converted guard", () => {
    it("refuses to move a converted lead with a linked investor, writing no audit event", async () => {
      const { investor } = await createInvestor({ email: uniqEmail("inv") });
      const lead = await createLead({
        listId: list.id,
        email: uniqEmail("conv"),
        status: "converted",
        investorId: investor.id
      });

      const result = await setLeadStatus({ leadId: lead.id, status: "contacted" });

      expect(result).toEqual({
        ok: false,
        error: "This lead is converted and linked to an investor; its stage cannot be changed."
      });
      expect((await getLead(lead.id))?.status).toBe("converted");
      expect(await listAuditEvents("lead.status_changed", lead.id)).toHaveLength(0);
    });

    it("still allows a converted lead with no linked investor to change stage", async () => {
      const lead = await createLead({
        listId: list.id,
        email: uniqEmail("nolink"),
        status: "converted"
      });

      expect(await setLeadStatus({ leadId: lead.id, status: "qualified" })).toEqual({
        ok: true
      });
      expect((await getLead(lead.id))?.status).toBe("qualified");
    });

    it("still allows ordinary stage transitions and audits them", async () => {
      const lead = await createLead({ listId: list.id, email: uniqEmail("ok") });

      expect(await setLeadStatus({ leadId: lead.id, status: "contacted" })).toEqual({
        ok: true
      });
      expect((await getLead(lead.id))?.status).toBe("contacted");
      expect(await listAuditEvents("lead.status_changed", lead.id)).toHaveLength(1);
    });
  });

  describe("IB unassigned queue excludes terminal statuses", () => {
    it("hides unqualified/duplicate/converted queue leads but keeps workable ones", async () => {
      const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
      const workable = await createLead({
        listId: list.id,
        email: uniqEmail("work"),
        ibId: ib.profile.id,
        status: "contacted"
      });
      for (const status of ["unqualified", "duplicate", "converted"] as const) {
        await createLead({
          listId: list.id,
          email: uniqEmail(status),
          ibId: ib.profile.id,
          status
        });
      }

      signInAs(ib.authUser);
      const queue = await searchLeadsForStaff({ assignment: "unassigned" });
      expect(queue.rows.map((row) => row.id)).toEqual([workable.id]);

      // Terminal leads are not deleted from the book: the scope-wide search
      // (and the stage filter) still surfaces them.
      const all = await searchLeadsForStaff({});
      expect(all.total).toBe(4);
      const terminal = await searchLeadsForStaff({ status: "unqualified" });
      expect(terminal.total).toBe(1);
    });
  });

  describe("getLeadForStaff (lead detail lookup)", () => {
    it("loads a single lead with join data for a super_admin", async () => {
      const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
      const lead = await createLead({
        listId: list.id,
        email: uniqEmail("one"),
        ibId: ib.profile.id
      });

      const row = await getLeadForStaff(lead.id);

      expect(row.id).toBe(lead.id);
      expect(row.email).toBe(lead.email);
      expect(row.ibId).toBe(ib.profile.id);
      expect(row.ibEmail).toBe(ib.profile.email);
    });

    it("scopes agents to their own book and hides other leads behind NOT_FOUND", async () => {
      const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
      const agent = await createStaff({ email: uniqEmail("ag"), role: "agent" });
      const other = await createStaff({ email: uniqEmail("ag"), role: "agent" });
      const own = await createLead({
        listId: list.id,
        email: uniqEmail("own"),
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });
      const foreign = await createLead({
        listId: list.id,
        email: uniqEmail("foreign"),
        ibId: ib.profile.id,
        assignedAgentId: other.profile.id
      });

      signInAs(agent.authUser);
      expect((await getLeadForStaff(own.id)).id).toBe(own.id);
      // No existence oracle: an out-of-book lead looks exactly like a missing one.
      await expect(getLeadForStaff(foreign.id)).rejects.toThrow("NOT_FOUND");
      await expect(getLeadForStaff(randomUUID())).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("updateLeadDetails email handling", () => {
    it("rejects an email that collides with another lead in the list, writing no audit event", async () => {
      const taken = uniqEmail("taken");
      await createLead({ listId: list.id, email: taken });
      const lead = await createLead({ listId: list.id, email: uniqEmail("free") });

      const result = await updateLeadDetails({
        leadId: lead.id,
        fullName: "Test Lead",
        email: taken.toUpperCase(),
        phone: "",
        notes: ""
      });

      expect(result).toEqual({
        ok: false,
        error: "Another lead in this list already uses that email."
      });
      expect((await getLead(lead.id))?.email).toBe(lead.email);
      expect(await listAuditEvents("lead.details_updated", lead.id)).toHaveLength(0);
    });

    it("audits the old and new email on a successful edit", async () => {
      const oldEmail = uniqEmail("before");
      const newEmail = uniqEmail("after");
      const lead = await createLead({ listId: list.id, email: oldEmail });

      const result = await updateLeadDetails({
        leadId: lead.id,
        fullName: "Test Lead",
        email: newEmail.toUpperCase(),
        phone: "",
        notes: ""
      });

      expect(result).toEqual({ ok: true });
      expect((await getLead(lead.id))?.email).toBe(newEmail);
      const events = await listAuditEvents("lead.details_updated", lead.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.payload).toMatchObject({
        listId: list.id,
        fromEmail: oldEmail,
        toEmail: newEmail
      });
    });
  });
});

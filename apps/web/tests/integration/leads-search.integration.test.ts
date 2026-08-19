/**
 * Integration tests for searchLeadsForStaff (lib/leads/queries.ts) — server-side
 * search, stage filter, and 25/page offset pagination with role scoping intact.
 * Real Postgres scratch database; only the session is mocked.
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

import { LEADS_PAGE_SIZE, searchLeadsForStaff } from "@/lib/leads/queries";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  createLead,
  createLeadList,
  createStaff,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(user: { id: string; email: string } | null) {
  sessionState.user = user;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;

describeIntegration("searchLeadsForStaff (integration)", () => {
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

  it("finds leads by case-insensitive name or email substring, scoped to the agent's book", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const agent = await createStaff({
      email: uniqEmail("agent"),
      role: "agent",
      ibId: ib.profile.id
    });
    const own = await createLead({
      listId: list.id,
      fullName: "Ada SEARCHME Lovelace",
      email: uniqEmail("ada"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });
    // Same substring, but unassigned in the IB queue — invisible to the agent.
    await createLead({
      listId: list.id,
      fullName: "Ada SEARCHME Clone",
      email: uniqEmail("clone"),
      ibId: ib.profile.id
    });

    signInAs(agent.authUser);
    const byName = await searchLeadsForStaff({ q: "searchme" });
    expect(byName.rows.map((row) => row.id)).toEqual([own.id]);

    const byEmail = await searchLeadsForStaff({ q: own.email.toUpperCase() });
    expect(byEmail.rows.map((row) => row.id)).toEqual([own.id]);
  });

  it("paginates 25 per page with a stable order and reports the total", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    for (let i = 0; i < 30; i += 1) {
      await createLead({
        listId: list.id,
        fullName: `Page ${String(i).padStart(2, "0")}`,
        email: uniqEmail("page"),
        ibId: ib.profile.id
      });
    }

    signInAs(ib.authUser);
    const page1 = await searchLeadsForStaff({ page: 1 });
    const page2 = await searchLeadsForStaff({ page: 2 });
    expect(LEADS_PAGE_SIZE).toBe(25);
    expect(page1.rows).toHaveLength(25);
    expect(page1.total).toBe(30);
    expect(page2.rows).toHaveLength(5);
    expect(page2.total).toBe(30);
    const ids = new Set([...page1.rows, ...page2.rows].map((row) => row.id));
    expect(ids.size).toBe(30);
  });

  it("filters by stage, ignores unknown stages, and splits an IB's queue from its team", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const agent = await createStaff({
      email: uniqEmail("agent"),
      role: "agent",
      ibId: ib.profile.id
    });
    const queued = await createLead({
      listId: list.id,
      email: uniqEmail("q"),
      ibId: ib.profile.id,
      status: "contacted"
    });
    const teamed = await createLead({
      listId: list.id,
      email: uniqEmail("t"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id,
      status: "qualified"
    });

    signInAs(ib.authUser);
    const queue = await searchLeadsForStaff({ assignment: "unassigned" });
    expect(queue.rows.map((row) => row.id)).toEqual([queued.id]);
    const team = await searchLeadsForStaff({ assignment: "assigned" });
    expect(team.rows.map((row) => row.id)).toEqual([teamed.id]);

    const qualified = await searchLeadsForStaff({ status: "qualified" });
    expect(qualified.rows.map((row) => row.id)).toEqual([teamed.id]);

    const bogus = await searchLeadsForStaff({ status: "bogus" });
    expect(bogus.total).toBe(2);
  });

  it("lets a super_admin search across every book", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const lead = await createLead({
      listId: list.id,
      fullName: "GLOBALSEARCH Unique",
      email: uniqEmail("g"),
      ibId: ib.profile.id
    });

    const result = await searchLeadsForStaff({ q: "globalsearch" });
    expect(result.rows.some((row) => row.id === lead.id)).toBe(true);
  });

  it("filters to stale leads only: non-terminal and idle for over 7 days", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const stale = await createLead({
      listId: list.id,
      email: uniqEmail("stale"),
      ibId: ib.profile.id,
      status: "contacted",
      lastActivityAt: tenDaysAgo
    });
    // Fresh activity — not stale.
    await createLead({
      listId: list.id,
      email: uniqEmail("fresh"),
      ibId: ib.profile.id,
      status: "contacted",
      lastActivityAt: new Date()
    });
    // Terminal stage never counts as stale, however old the activity.
    await createLead({
      listId: list.id,
      email: uniqEmail("terminal"),
      ibId: ib.profile.id,
      status: "converted",
      lastActivityAt: tenDaysAgo
    });
    // No recorded activity is "unworked", not stale.
    await createLead({
      listId: list.id,
      email: uniqEmail("unworked"),
      ibId: ib.profile.id,
      status: "new"
    });

    signInAs(ib.authUser);
    const result = await searchLeadsForStaff({ stale: true });
    expect(result.rows.map((row) => row.id)).toEqual([stale.id]);
    expect(result.total).toBe(1);
  });

  it("filters to unassigned leads with unassigned: true", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const agent = await createStaff({
      email: uniqEmail("agent"),
      role: "agent",
      ibId: ib.profile.id
    });
    const queued = await createLead({
      listId: list.id,
      email: uniqEmail("q"),
      ibId: ib.profile.id
    });
    await createLead({
      listId: list.id,
      email: uniqEmail("t"),
      ibId: ib.profile.id,
      assignedAgentId: agent.profile.id
    });

    signInAs(ib.authUser);
    const result = await searchLeadsForStaff({ unassigned: true });
    expect(result.rows.map((row) => row.id)).toEqual([queued.id]);
  });

  it("scopes the search to a single list with listId, role scoping intact", async () => {
    const ib = await createStaff({ email: uniqEmail("ib"), role: "ib" });
    const otherList = await createLeadList(admin.profile.id);
    const inList = await createLead({
      listId: list.id,
      email: uniqEmail("in"),
      ibId: ib.profile.id
    });
    await createLead({
      listId: otherList.id,
      email: uniqEmail("out"),
      ibId: ib.profile.id
    });

    signInAs(ib.authUser);
    const result = await searchLeadsForStaff({ listId: list.id });
    expect(result.rows.map((row) => row.id)).toEqual([inList.id]);
    expect(result.total).toBe(1);

    // An agent never escapes its own book, even with a client-supplied listId.
    const agent = await createStaff({
      email: uniqEmail("agent"),
      role: "agent",
      ibId: ib.profile.id
    });
    signInAs(agent.authUser);
    const denied = await searchLeadsForStaff({ listId: list.id });
    expect(denied.rows).toHaveLength(0);
    expect(denied.total).toBe(0);
  });
});

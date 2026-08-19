import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn() },
  auditEvents: {},
  distributions: {},
  documents: {},
  holdings: {},
  interests: {},
  investors: {},
  leads: {},
  user: {}
}));

import { db } from "@/lib/db";
import {
  describeAuditEvent,
  formatRelativeTime,
  getAdminDashboardKpis,
  getStaleLeadCountForStaff,
  isAuditEventVisibleForStaff,
  listScopedActivityForStaff
} from "@/lib/admin/dashboard";

const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

/** Queue one db.select chain resolving to `rows` at `.where(...)` (with optional innerJoin in between). */
function mockWhereSelect(rows: unknown) {
  const whereResult = Promise.resolve(rows);
  selectMock.mockImplementationOnce(() => ({
    from: () => ({
      where: () => whereResult,
      innerJoin: () => ({ where: () => whereResult })
    })
  }));
}

/** Queue the audit-events feed select chain (terminal `.limit()`). */
function mockFeedSelect(rows: unknown) {
  selectMock.mockImplementationOnce(() => ({
    from: () => ({
      leftJoin: () => ({
        orderBy: () => ({ limit: () => Promise.resolve(rows) })
      })
    })
  }));
}

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-23T12:00:00Z");

  it("renders compact relative labels", () => {
    expect(formatRelativeTime(new Date("2026-07-23T11:59:40Z"), now)).toBe("just now");
    expect(formatRelativeTime(new Date("2026-07-23T11:45:00Z"), now)).toBe("15 min ago");
    expect(formatRelativeTime(new Date("2026-07-23T09:00:00Z"), now)).toBe("3 h ago");
    expect(formatRelativeTime(new Date("2026-07-21T12:00:00Z"), now)).toBe("2 d ago");
  });

  it("falls back to a short date after a week", () => {
    expect(formatRelativeTime(new Date("2026-07-10T12:00:00Z"), now)).toBe("10-07-2026");
  });
});

describe("describeAuditEvent", () => {
  it("renders friendly lines for known actions", () => {
    expect(
      describeAuditEvent({ action: "lead.status_changed", entityType: "lead", payload: { status: "qualified" } })
    ).toBe("moved a lead to Qualified");
    expect(
      describeAuditEvent({ action: "kyc.submitted", entityType: "investor", payload: { files: 2 } })
    ).toBe("submitted KYC documents");
    expect(
      describeAuditEvent({ action: "distribution.recorded", entityType: "distribution", payload: {} })
    ).toBe("recorded a distribution");
    expect(
      describeAuditEvent({ action: "interest.confirmed", entityType: "interest", payload: {} })
    ).toBe("confirmed an investment");
  });

  it("uses label maps — never raw enum strings — and has a safe fallback", () => {
    expect(
      describeAuditEvent({ action: "lead.status_changed", entityType: "lead", payload: { status: "unqualified" } })
    ).toBe("moved a lead to Unqualified");
    // Unknown actions must not leak the raw action key into the UI.
    expect(
      describeAuditEvent({ action: "staff.two_factor_reset", entityType: "staff_profile", payload: {} })
    ).toBe("recorded an activity");
  });

  it("names the entity when the feed resolved one in scope", () => {
    expect(
      describeAuditEvent(
        { action: "lead.status_changed", entityType: "lead", payload: { status: "qualified" } },
        { type: "lead", name: "jane@example.com" }
      )
    ).toBe("moved jane@example.com to Qualified");
    expect(
      describeAuditEvent(
        { action: "distribution.recorded", entityType: "distribution", payload: {} },
        { type: "investor", name: "investor@example.com" }
      )
    ).toBe("recorded a distribution for investor@example.com");
    expect(
      describeAuditEvent(
        { action: "kyc.approved", entityType: "investor", payload: {} },
        { type: "investor", name: "investor@example.com" }
      )
    ).toBe("approved KYC for investor@example.com");
  });

  it("ignores entity context of the wrong type and keeps opportunity wording for asset events", () => {
    expect(
      describeAuditEvent(
        { action: "lead.status_changed", entityType: "lead", payload: { status: "qualified" } },
        { type: "investor", name: "investor@example.com" }
      )
    ).toBe("moved a lead to Qualified");
    expect(
      describeAuditEvent({ action: "asset.status_changed", entityType: "asset", payload: {} })
    ).toBe("changed an opportunity status");
  });
});

describe("isAuditEventVisibleForStaff", () => {
  const lookups = {
    investors: new Map([
      ["inv-own", { assignedAgentId: "agent-1", ibId: "ib-1" }],
      ["inv-other", { assignedAgentId: "agent-2", ibId: "ib-2" }]
    ]),
    leads: new Map([
      ["lead-own", { assignedAgentId: "agent-1", ibId: "ib-1" }],
      ["lead-other", { assignedAgentId: "agent-2", ibId: "ib-2" }]
    ]),
    interestInvestorIds: new Map([["int-1", "inv-own"], ["int-2", "inv-other"]]),
    distributionInvestorIds: new Map([["dist-1", "inv-own"]]),
    documents: new Map<
      string,
      { ownerType: "asset" | "holding" | "platform" | "investor"; ownerId: string | null }
    >([
      ["doc-inv", { ownerType: "investor", ownerId: "inv-own" }],
      ["doc-asset", { ownerType: "asset", ownerId: "asset-1" }],
      ["doc-holding-own", { ownerType: "holding", ownerId: "holding-own" }],
      ["doc-holding-other", { ownerType: "holding", ownerId: "holding-other" }],
      ["doc-holding-gone", { ownerType: "holding", ownerId: "holding-gone" }]
    ]),
    holdingOwners: new Map([
      ["holding-own", { assignedAgentId: "agent-1", ibId: "ib-1" }],
      ["holding-other", { assignedAgentId: "agent-2", ibId: "ib-2" }]
    ])
  };
  const agent = { role: "agent" as const, staffId: "agent-1" };

  it("super admin sees everything", () => {
    expect(
      isAuditEventVisibleForStaff(
        { role: "super_admin", staffId: "s1" },
        { entityType: "staff_profile", entityId: "x" },
        lookups
      )
    ).toBe(true);
  });

  it("agent sees own-book investor and lead events only", () => {
    expect(isAuditEventVisibleForStaff(agent, { entityType: "investor", entityId: "inv-own" }, lookups)).toBe(true);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "investor", entityId: "inv-other" }, lookups)).toBe(false);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "lead", entityId: "lead-own" }, lookups)).toBe(true);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "lead", entityId: "lead-other" }, lookups)).toBe(false);
  });

  it("ib sees team-book events, scoped by ibId", () => {
    const ib = { role: "ib" as const, staffId: "ib-1" };
    expect(isAuditEventVisibleForStaff(ib, { entityType: "investor", entityId: "inv-own" }, lookups)).toBe(true);
    expect(isAuditEventVisibleForStaff(ib, { entityType: "lead", entityId: "lead-other" }, lookups)).toBe(false);
  });

  it("resolves interest and distribution events through their investor", () => {
    expect(isAuditEventVisibleForStaff(agent, { entityType: "interest", entityId: "int-1" }, lookups)).toBe(true);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "interest", entityId: "int-2" }, lookups)).toBe(false);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "distribution", entityId: "dist-1" }, lookups)).toBe(true);
  });

  it("skips events whose entity is not resolvable in scope", () => {
    expect(isAuditEventVisibleForStaff(agent, { entityType: "investor", entityId: "inv-gone" }, lookups)).toBe(false);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "lead", entityId: null }, lookups)).toBe(false);
    // staff_profile / lead_list events are super-admin only.
    expect(isAuditEventVisibleForStaff(agent, { entityType: "staff_profile", entityId: "sp-1" }, lookups)).toBe(false);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "lead_list", entityId: "ll-1" }, lookups)).toBe(false);
  });

  it("documents follow their owner; asset events are staff-wide", () => {
    expect(isAuditEventVisibleForStaff(agent, { entityType: "document", entityId: "doc-inv" }, lookups)).toBe(true);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "document", entityId: "doc-asset" }, lookups)).toBe(true);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "asset", entityId: "asset-1" }, lookups)).toBe(true);
  });

  it("scopes holding-document events to the owner's book, fail-closed when unresolvable", () => {
    expect(isAuditEventVisibleForStaff(agent, { entityType: "document", entityId: "doc-holding-own" }, lookups)).toBe(true);
    expect(isAuditEventVisibleForStaff(agent, { entityType: "document", entityId: "doc-holding-other" }, lookups)).toBe(false);
    // Holding doc whose owner assignment can't be resolved stays hidden.
    expect(isAuditEventVisibleForStaff(agent, { entityType: "document", entityId: "doc-holding-gone" }, lookups)).toBe(false);
    // IBs see their team book through the same scoping.
    const ib = { role: "ib" as const, staffId: "ib-2" };
    expect(isAuditEventVisibleForStaff(ib, { entityType: "document", entityId: "doc-holding-other" }, lookups)).toBe(true);
    expect(isAuditEventVisibleForStaff(ib, { entityType: "document", entityId: "doc-holding-own" }, lookups)).toBe(false);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAdminDashboardKpis", () => {
  it("counts investors in book, new leads this week, pending KYC and scheduled distributions", async () => {
    mockWhereSelect([{ id: "i1" }, { id: "i2" }]); // investors in book
    mockWhereSelect([{ id: "l1" }]); // new leads this week
    mockWhereSelect([{ id: "i3" }]); // pending KYC (submitted / under_review)
    mockWhereSelect([{ id: "d1" }, { id: "d2" }, { id: "d3" }]); // scheduled distributions

    const kpis = await getAdminDashboardKpis({ role: "agent", staffId: "agent-1" });

    expect(kpis).toEqual({
      investorsInBook: 2,
      newLeadsThisWeek: 1,
      pendingKyc: 1,
      scheduledDistributions: 3
    });
  });

  it("returns zeroes for an empty book", async () => {
    mockWhereSelect([]);
    mockWhereSelect([]);
    mockWhereSelect([]);
    mockWhereSelect([]);

    const kpis = await getAdminDashboardKpis({ role: "super_admin", staffId: "s1" });

    expect(kpis).toEqual({
      investorsInBook: 0,
      newLeadsThisWeek: 0,
      pendingKyc: 0,
      scheduledDistributions: 0
    });
  });
});

describe("getStaleLeadCountForStaff", () => {
  it("counts stale leads in the caller's book", async () => {
    mockWhereSelect([{ id: "l1" }, { id: "l2" }]);

    const count = await getStaleLeadCountForStaff({ role: "ib", staffId: "ib-1" });

    expect(count).toBe(2);
  });
});

describe("listScopedActivityForStaff", () => {
  const baseEvent = {
    action: "kyc.submitted",
    payload: {},
    actorEmail: "agent@example.com",
    createdAt: new Date("2026-07-23T10:00:00Z")
  };

  it("keeps only events visible in an agent's book", async () => {
    mockFeedSelect([
      { ...baseEvent, id: "e1", entityType: "investor", entityId: "inv-own" },
      { ...baseEvent, id: "e2", entityType: "investor", entityId: "inv-other" },
      { ...baseEvent, id: "e3", entityType: "staff_profile", entityId: "sp-1" }
    ]);
    // Batch ownership lookups: only the investors query hits the db here
    // (no lead/interest/distribution/document entity ids in the feed rows).
    mockWhereSelect([
      { id: "inv-own", assignedAgentId: "agent-1", ibId: "ib-1" },
      { id: "inv-other", assignedAgentId: "agent-2", ibId: "ib-2" }
    ]);

    const feed = await listScopedActivityForStaff({ role: "agent", staffId: "agent-1" });

    expect(feed.map((row) => row.id)).toEqual(["e1"]);
  });

  it("resolves interest events through their investor and caps at the limit", async () => {
    const interestEvents = Array.from({ length: 20 }, (_, i) => ({
      ...baseEvent,
      id: `e${i}`,
      entityType: "interest",
      entityId: `int-${i}`
    }));
    mockFeedSelect(interestEvents);
    // interests batch: all belong to the agent's investor.
    mockWhereSelect(
      interestEvents.map((row) => ({ id: row.entityId, investorId: "inv-own" }))
    );
    // investors batch (ids gathered from the interest rows).
    mockWhereSelect([{ id: "inv-own", assignedAgentId: "agent-1", ibId: "ib-1" }]);

    const feed = await listScopedActivityForStaff({ role: "agent", staffId: "agent-1" }, 15);

    expect(feed).toHaveLength(15);
    expect(feed[0]?.id).toBe("e0");
  });

  it("returns the latest events unfiltered for super admin", async () => {
    mockFeedSelect([
      { ...baseEvent, id: "e1", entityType: "staff_profile", entityId: "sp-1" },
      { ...baseEvent, id: "e2", entityType: "investor", entityId: null }
    ]);

    const feed = await listScopedActivityForStaff({ role: "super_admin", staffId: "s1" });

    expect(feed.map((row) => row.id)).toEqual(["e1", "e2"]);
    // No resolvable entity ids in these rows, so no batch ownership queries run.
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(feed[1]?.entity).toBeNull();
    expect(feed[1]?.href).toBeNull();
  });

  it("names and deep-links the investor an in-book event concerns", async () => {
    mockFeedSelect([{ ...baseEvent, id: "e1", entityType: "investor", entityId: "inv-own" }]);
    mockWhereSelect([
      { id: "inv-own", assignedAgentId: "agent-1", ibId: "ib-1", fullName: "", email: "investor@example.com" }
    ]);

    const feed = await listScopedActivityForStaff({ role: "agent", staffId: "agent-1" });

    expect(feed[0]?.entity).toEqual({ type: "investor", name: "investor@example.com" });
    expect(feed[0]?.href).toBe("/admin/investors/inv-own");
  });

  it("names and deep-links the lead a lead event concerns", async () => {
    mockFeedSelect([
      { ...baseEvent, id: "e1", action: "lead.status_changed", entityType: "lead", entityId: "lead-own", payload: { status: "qualified" } }
    ]);
    // leads batch (lead events add no investor ids, so no investor query runs).
    mockWhereSelect([
      { id: "lead-own", assignedAgentId: "agent-1", ibId: "ib-1", fullName: "Jane Doe", email: "jane@example.com" }
    ]);

    const feed = await listScopedActivityForStaff({ role: "agent", staffId: "agent-1" });

    expect(feed[0]?.entity).toEqual({ type: "lead", name: "Jane Doe" });
    expect(feed[0]?.href).toBe("/admin/leads/lead/lead-own");
    expect(describeAuditEvent(feed[0]!, feed[0]!.entity)).toBe("moved Jane Doe to Qualified");
  });

  it("resolves interest events to their investor's name and record", async () => {
    mockFeedSelect([
      { ...baseEvent, id: "e1", action: "interest.confirmed", entityType: "interest", entityId: "int-1" }
    ]);
    // interests batch, then the investors batch keyed off the interest's investorId.
    mockWhereSelect([{ id: "int-1", investorId: "inv-own" }]);
    mockWhereSelect([
      { id: "inv-own", assignedAgentId: "agent-1", ibId: "ib-1", fullName: "Jane Investor", email: "jane@example.com" }
    ]);

    const feed = await listScopedActivityForStaff({ role: "agent", staffId: "agent-1" });

    // Name is preferred over email when both exist.
    expect(feed[0]?.entity).toEqual({ type: "investor", name: "Jane Investor" });
    expect(feed[0]?.href).toBe("/admin/investors/inv-own");
    expect(describeAuditEvent(feed[0]!, feed[0]!.entity)).toBe(
      "confirmed an investment for Jane Investor"
    );
  });

  it("scopes holding-document feed events through the holding-owner batch", async () => {
    mockFeedSelect([
      { ...baseEvent, id: "e1", action: "document.downloaded", entityType: "document", entityId: "doc-1" },
      { ...baseEvent, id: "e2", action: "document.downloaded", entityType: "document", entityId: "doc-2" }
    ]);
    // documents batch (holding docs add no investor ids, so the investors
    // batch is skipped and the holdings batch is the next select).
    mockWhereSelect([
      { id: "doc-1", ownerType: "holding", ownerId: "holding-1" },
      { id: "doc-2", ownerType: "holding", ownerId: "holding-2" }
    ]);
    // holdings batch joined to the owning investor's assignment.
    mockWhereSelect([
      { id: "holding-1", assignedAgentId: "agent-1", ibId: "ib-1" },
      { id: "holding-2", assignedAgentId: "agent-2", ibId: "ib-2" }
    ]);

    const feed = await listScopedActivityForStaff({ role: "agent", staffId: "agent-1" });

    // Only the in-book holding's document event survives.
    expect(feed.map((row) => row.id)).toEqual(["e1"]);
    expect(feed[0]?.entity).toBeNull();
  });

  it("links asset (opportunity) events to the assets workspace without naming an entity", async () => {
    mockFeedSelect([
      { ...baseEvent, id: "e1", action: "asset.status_changed", entityType: "asset", entityId: "asset-1" }
    ]);

    const feed = await listScopedActivityForStaff({ role: "super_admin", staffId: "s1" });

    expect(feed[0]?.entity).toBeNull();
    expect(feed[0]?.href).toBe("/admin/assets");
  });
});

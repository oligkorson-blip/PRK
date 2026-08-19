import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth/staff", () => ({
  requireSuperAdmin: vi.fn()
}));

vi.mock("@/lib/auth/roles", () => ({
  effectiveStaffRole: vi.fn(() => "agent"),
  isActiveStaff: vi.fn((profile: { deactivatedAt: Date | null }) => profile.deactivatedAt === null)
}));

vi.mock("@/lib/db", () => {
  const db = {
    transaction: vi.fn()
  };

  return {
    db,
    auditEvents: {},
    investors: {
      assignedAgentId: "investors.assignedAgentId",
      ibId: "investors.ibId",
      updatedAt: "investors.updatedAt"
    },
    leadAssignments: {},
    leads: {
      id: "leads.id",
      ibId: "leads.ibId",
      assignedAgentId: "leads.assignedAgentId",
      lastActivityAt: "leads.lastActivityAt",
      updatedAt: "leads.updatedAt"
    },
    staffProfiles: {
      id: "staffProfiles.id",
      email: "staffProfiles.email",
      role: "staffProfiles.role",
      ibId: "staffProfiles.ibId",
      deactivatedAt: "staffProfiles.deactivatedAt",
      updatedAt: "staffProfiles.updatedAt"
    },
    user: {
      id: "user.id",
      email: "user.email"
    }
  };
});

import { requireSuperAdmin } from "@/lib/auth/staff";
import { auditEvents, db, leadAssignments, leads, staffProfiles } from "@/lib/db";
import { demoteAgent } from "@/lib/staff/demote-actions";

function adminContext() {
  return {
    user: { id: "user-1", email: "admin@example.com" },
    staff: { id: "super-1", role: "super_admin" as const, ibId: null },
    role: "super_admin" as const
  };
}

function sourceAgent() {
  return {
    id: "agent-1",
    email: "source@example.com",
    role: "agent" as const,
    ibId: "ib-1",
    deactivatedAt: null
  };
}

function targetAgent(deactivatedAt: Date | null = null) {
  return {
    id: "agent-2",
    email: "target@example.com",
    role: "agent" as const,
    ibId: "ib-1",
    deactivatedAt
  };
}

function ownedLead() {
  return {
    id: "lead-1",
    ibId: "ib-1",
    assignedAgentId: "agent-1"
  };
}

function selectChain(rows: unknown[], lock: boolean) {
  const resolved = Promise.resolve(rows);
  const forUpdate = vi.fn().mockReturnValue(resolved);
  const orderBy = vi.fn().mockReturnValue(lock ? { for: forUpdate } : resolved);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, forUpdate };
}

function updateChain(returningRows: unknown[] | null) {
  const returning = vi.fn().mockResolvedValue(returningRows ?? []);
  const where = returningRows === null
    ? vi.fn().mockResolvedValue([])
    : vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function configureTransaction({
  profiles,
  leadUpdateResult = [{ id: "lead-1" }]
}: {
  profiles: unknown[];
  leadUpdateResult?: unknown[];
}) {
  const initialLeadSelect = selectChain([ownedLead()], true);
  const profileSelect = selectChain(profiles, true);
  const refreshedLeadSelect = selectChain([ownedLead()], false);

  const leadUpdate = updateChain(leadUpdateResult);
  const investorUpdate = updateChain(null);
  const staffUpdate = updateChain(null);

  const tx = {
    select: vi
      .fn()
      .mockImplementationOnce(() => initialLeadSelect)
      .mockImplementationOnce(() => profileSelect)
      .mockImplementationOnce(() => refreshedLeadSelect),
    update: vi
      .fn()
      .mockImplementationOnce(() => leadUpdate)
      .mockImplementationOnce(() => investorUpdate)
      .mockImplementationOnce(() => staffUpdate),
    insert: vi
      .fn()
      .mockImplementation(() => ({
        values: vi.fn().mockResolvedValue([])
      }))
  };

  vi.mocked(db.transaction).mockImplementation(
    async (callback) => callback(tx as never) as never
  );

  return { tx, initialLeadSelect, profileSelect, leadUpdate };
}

describe("agent deactivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue(adminContext());
  });

  it("locks owned leads and source and target profiles before reassignment", async () => {
    const { tx, initialLeadSelect, profileSelect, leadUpdate } = configureTransaction({
      profiles: [sourceAgent(), targetAgent()]
    });

    const result = await demoteAgent({
      staffId: "agent-1",
      leadStrategy: { reassignToAgentId: "agent-2" }
    });

    expect(result).toEqual({ ok: true });
    expect(initialLeadSelect.forUpdate).toHaveBeenCalledWith("update");
    expect(profileSelect.forUpdate).toHaveBeenCalledWith("update");
    expect(tx.update).toHaveBeenCalledWith(leads);
    expect(tx.insert).toHaveBeenCalledWith(leadAssignments);
    expect(tx.insert).toHaveBeenCalledWith(auditEvents);
    expect(leadUpdate.returning).toHaveBeenCalled();
  });

  it("rejects a target that became inactive while the page was open", async () => {
    const { tx, profileSelect } = configureTransaction({
      profiles: [sourceAgent(), targetAgent(new Date("2026-08-03T00:00:00.000Z"))]
    });

    const result = await demoteAgent({
      staffId: "agent-1",
      leadStrategy: { reassignToAgentId: "agent-2" }
    });

    expect(result).toEqual({
      ok: false,
      error: "Reassignment target agent not found."
    });
    expect(profileSelect.forUpdate).toHaveBeenCalledWith("update");
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rolls back when ownership changes before the guarded lead update", async () => {
    const { tx } = configureTransaction({
      profiles: [sourceAgent()],
      leadUpdateResult: []
    });

    const result = await demoteAgent({
      staffId: "agent-1",
      leadStrategy: "return_to_ib_queue"
    });

    expect(result).toEqual({
      ok: false,
      error: "Ownership changed while staff access was being removed. Refresh and try again."
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

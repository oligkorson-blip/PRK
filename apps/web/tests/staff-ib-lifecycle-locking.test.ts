import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth/staff", () => ({
  requireSuperAdmin: vi.fn()
}));

vi.mock("@/lib/auth/roles", () => ({
  effectiveStaffRole: vi.fn(({ dbRole }: { dbRole: string }) => dbRole),
  isActiveStaff: vi.fn(
    (profile: { deactivatedAt: Date | null }) => profile.deactivatedAt === null
  )
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
import { demoteIb } from "@/lib/staff/demote-actions";
import { transferAgentToIb } from "@/lib/staff/transfer-actions";

function adminContext() {
  return {
    user: { id: "user-1", email: "admin@example.com" },
    staff: { id: "super-1", role: "super_admin" as const, ibId: null },
    role: "super_admin" as const
  };
}

function ibProfile(id: string, deactivatedAt: Date | null = null) {
  return {
    id,
    email: id + "@example.com",
    role: "ib" as const,
    ibId: null,
    deactivatedAt
  };
}

function agentProfile(
  id = "agent-1",
  ibId: string | null = "ib-1",
  deactivatedAt: Date | null = null
) {
  return {
    id,
    email: id + "@example.com",
    role: "agent" as const,
    ibId,
    deactivatedAt
  };
}

function lead(
  id = "lead-1",
  ibId: string | null = "ib-1",
  assignedAgentId: string | null = "agent-1"
) {
  return { id, ibId, assignedAgentId };
}

function selectChain(rows: unknown[], locked: boolean) {
  const resolved = Promise.resolve(rows);
  const forUpdate = vi.fn().mockReturnValue(resolved);
  const orderBy = vi.fn().mockReturnValue(locked ? { for: forUpdate } : resolved);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, forUpdate };
}

function updateChain(returningRows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returningRows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, returning };
}

function configureTransaction({
  selects,
  updateResults
}: {
  selects: Array<{ rows: unknown[]; locked: boolean }>;
  updateResults: unknown[][];
}) {
  const selectChains = selects.map(({ rows, locked }) => selectChain(rows, locked));
  const updateChains = updateResults.map((rows) => updateChain(rows));
  let updateIndex = 0;

  const tx = {
    select: vi.fn(),
    update: vi.fn().mockImplementation(() => {
      const chain = updateChains[updateIndex];
      updateIndex += 1;
      return chain ?? updateChain([]);
    }),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockResolvedValue([])
    }))
  };

  for (const chain of selectChains) {
    tx.select.mockImplementationOnce(() => chain);
  }

  vi.mocked(db.transaction).mockImplementation(
    async (callback) => callback(tx as never) as never
  );

  return { tx, selectChains, updateChains };
}

describe("IB lifecycle locking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue(adminContext());
  });

  it("locks the IB team leads, agents, and source and target IB rows before moving the team", async () => {
    const teamLead = lead();
    const { tx, selectChains, updateChains } = configureTransaction({
      selects: [
        { rows: [teamLead], locked: true },
        { rows: [agentProfile()], locked: true },
        { rows: [ibProfile("ib-1"), ibProfile("ib-2")], locked: true },
        { rows: [teamLead], locked: false }
      ],
      updateResults: [[{ id: "lead-1" }], [], [], []]
    });

    const result = await demoteIb({
      staffId: "ib-1",
      teamStrategy: { reassignTeamToIbId: "ib-2" }
    });

    expect(result).toEqual({ ok: true });
    expect(selectChains[0].forUpdate).toHaveBeenCalledWith("update");
    expect(selectChains[1].forUpdate).toHaveBeenCalledWith("update");
    expect(selectChains[2].forUpdate).toHaveBeenCalledWith("update");
    expect(tx.update).toHaveBeenCalledWith(leads);
    expect(tx.update).toHaveBeenCalledWith(staffProfiles);
    expect(tx.insert).toHaveBeenCalledWith(leadAssignments);
    expect(tx.insert).toHaveBeenCalledWith(auditEvents);
    expect(updateChains[0].returning).toHaveBeenCalled();
  });

  it("rejects an IB target that became inactive before the locked transaction check", async () => {
    const { tx, selectChains } = configureTransaction({
      selects: [
        { rows: [lead()], locked: true },
        { rows: [], locked: true },
        {
          rows: [
            ibProfile("ib-1"),
            ibProfile("ib-2", new Date("2026-08-03T00:00:00.000Z"))
          ],
          locked: true
        }
      ],
      updateResults: []
    });

    const result = await demoteIb({
      staffId: "ib-1",
      teamStrategy: { reassignTeamToIbId: "ib-2" }
    });

    expect(result).toEqual({
      ok: false,
      error: "Reassignment target IB not found."
    });
    expect(selectChains[2].forUpdate).toHaveBeenCalledWith("update");
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rolls back when an IB lead loses ownership before the guarded update", async () => {
    const { tx } = configureTransaction({
      selects: [
        { rows: [lead()], locked: true },
        { rows: [], locked: true },
        { rows: [ibProfile("ib-1"), ibProfile("ib-2")], locked: true },
        { rows: [lead()], locked: false }
      ],
      updateResults: [[]]
    });

    const result = await demoteIb({
      staffId: "ib-1",
      teamStrategy: { reassignTeamToIbId: "ib-2" }
    });

    expect(result).toEqual({
      ok: false,
      error: "Ownership changed while the IB team was being moved. Refresh and try again."
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("locks the agent leads and source and target staff rows before a cross-IB transfer", async () => {
    const agentLead = lead();
    const { tx, selectChains, updateChains } = configureTransaction({
      selects: [
        { rows: [agentLead], locked: true },
        { rows: [agentProfile(), ibProfile("ib-2")], locked: true },
        { rows: [agentLead], locked: false }
      ],
      updateResults: [[{ id: "agent-1" }], [{ id: "lead-1" }], []]
    });

    const result = await transferAgentToIb({
      agentStaffId: "agent-1",
      toIbStaffId: "ib-2",
      leadStrategy: "move_with_agent"
    });

    expect(result).toEqual({ ok: true });
    expect(selectChains[0].forUpdate).toHaveBeenCalledWith("update");
    expect(selectChains[1].forUpdate).toHaveBeenCalledWith("update");
    expect(tx.update).toHaveBeenCalledWith(staffProfiles);
    expect(tx.update).toHaveBeenCalledWith(leads);
    expect(tx.insert).toHaveBeenCalledWith(leadAssignments);
    expect(tx.insert).toHaveBeenCalledWith(auditEvents);
    expect(updateChains[0].returning).toHaveBeenCalled();
    expect(updateChains[1].returning).toHaveBeenCalled();
  });

  it("rejects a transfer target that became inactive before the locked transaction check", async () => {
    const { tx, selectChains } = configureTransaction({
      selects: [
        { rows: [lead()], locked: true },
        {
          rows: [
            agentProfile(),
            ibProfile("ib-2", new Date("2026-08-03T00:00:00.000Z"))
          ],
          locked: true
        }
      ],
      updateResults: []
    });

    const result = await transferAgentToIb({
      agentStaffId: "agent-1",
      toIbStaffId: "ib-2",
      leadStrategy: "keep_with_original_ib"
    });

    expect(result).toEqual({ ok: false, error: "IB not found." });
    expect(selectChains[1].forUpdate).toHaveBeenCalledWith("update");
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rolls back a transfer when a locked lead no longer belongs to the agent", async () => {
    const { tx } = configureTransaction({
      selects: [
        { rows: [lead()], locked: true },
        { rows: [agentProfile(), ibProfile("ib-2")], locked: true },
        { rows: [lead()], locked: false }
      ],
      updateResults: [[{ id: "agent-1" }], []]
    });

    const result = await transferAgentToIb({
      agentStaffId: "agent-1",
      toIbStaffId: "ib-2",
      leadStrategy: "keep_with_original_ib"
    });

    expect(result).toEqual({
      ok: false,
      error: "Ownership changed while the agent was being transferred. Refresh and try again."
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

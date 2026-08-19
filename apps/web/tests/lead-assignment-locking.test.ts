import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  requireSuperAdmin: vi.fn()
}));
vi.mock("@/lib/db", () => {
  const db = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn()
  };
  return {
    db,
    auditEvents: {},
    investors: {
      id: "investors.id",
      assignedAgentId: "investors.assignedAgentId",
      ibId: "investors.ibId",
      originalAgentId: "investors.originalAgentId",
      originalIbId: "investors.originalIbId"
    },
    leadAssignments: {},
    leads: {
      id: "leads.id",
      listId: "leads.listId",
      ibId: "leads.ibId",
      assignedAgentId: "leads.assignedAgentId",
      investorId: "leads.investorId",
      status: "leads.status"
    },
    staffProfiles: {
      id: "staffProfiles.id",
      email: "staffProfiles.email",
      role: "staffProfiles.role",
      ibId: "staffProfiles.ibId",
      deactivatedAt: "staffProfiles.deactivatedAt"
    }
  };
});

import { db } from "@/lib/db";
import { assignLeadToAgentCore } from "@/lib/leads/assign/cores";

function selectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const forUpdate = vi.fn().mockReturnValue(resolved);
  const limit = vi.fn().mockReturnValue(Object.assign(resolved, { for: forUpdate }));
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from, forUpdate };
}

function staffContext() {
  return {
    user: { id: "user-1", email: "admin@example.com" },
    staff: { id: "super-1", role: "super_admin" as const, ibId: null },
    role: "super_admin" as const
  };
}

function leadRow(investorId: string | null = null) {
  return {
    id: "lead-1",
    listId: "list-1",
    ibId: "ib-1",
    assignedAgentId: null,
    investorId,
    status: "new" as const
  };
}

function agentRow() {
  return {
    id: "agent-1",
    email: "agent@example.com",
    role: "agent" as const,
    ibId: "ib-1",
    deactivatedAt: null
  };
}

function configureExecutor(rows: unknown[][]) {
  const selectMock = vi.mocked(db.select);
  const locks = rows.map((result) => selectChain(result));
  for (const query of locks) {
    selectMock.mockImplementationOnce(() => query as never);
  }

  vi.mocked(db.update).mockImplementation(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([])
    })
  }) as never);
  vi.mocked(db.insert).mockImplementation(() => ({
    values: vi.fn().mockResolvedValue([])
  }) as never);

  return locks;
}

describe("lead assignment row locking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("locks the lead and target agent before changing ownership", async () => {
    const locks = configureExecutor([[leadRow()], [agentRow()]]);

    const result = await assignLeadToAgentCore(
      db as never,
      staffContext(),
      { leadId: "lead-1", agentStaffId: "agent-1" }
    );

    expect(result).toEqual({ ok: true });
    expect(locks[0].forUpdate).toHaveBeenCalledWith("update");
    expect(locks[1].forUpdate).toHaveBeenCalledWith("update");
  });

  it("locks the linked investor before preserving original attribution", async () => {
    const locks = configureExecutor([
      [leadRow("investor-1")],
      [agentRow()],
      [
        {
          id: "investor-1",
          assignedAgentId: null,
          ibId: null,
          originalAgentId: null,
          originalIbId: null
        }
      ]
    ]);

    const result = await assignLeadToAgentCore(
      db as never,
      staffContext(),
      { leadId: "lead-1", agentStaffId: "agent-1" }
    );

    expect(result).toEqual({ ok: true });
    expect(locks[2].forUpdate).toHaveBeenCalledWith("update");
  });
});

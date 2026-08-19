import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  requireSuperAdmin: vi.fn()
}));

vi.mock("@/lib/db", () => {
  const db = {
    select: vi.fn(),
    transaction: vi.fn()
  };

  return {
    db,
    leadLists: { id: "leadLists.id" },
    leads: { id: "leads.id", listId: "leads.listId" }
  };
});

vi.mock("@/lib/leads/assign/shared", () => ({
  requireSuperActor: vi.fn(),
  revalidateLead: vi.fn()
}));

vi.mock("@/lib/leads/assign/cores", () => ({
  assignLeadToAgentCore: vi.fn(),
  assignLeadToIbCore: vi.fn(),
  removeLeadAgentCore: vi.fn(),
  removeLeadAssignmentCore: vi.fn()
}));

import { db, leadLists, leads } from "@/lib/db";
import {
  assignLeadToAgentCore,
  assignLeadToIbCore,
  removeLeadAgentCore,
  removeLeadAssignmentCore
} from "@/lib/leads/assign/cores";
import { requireSuperActor, revalidateLead } from "@/lib/leads/assign/shared";
import { assignAllLeadsInList } from "@/lib/leads/assign/bulk-assign";

function staffContext() {
  return {
    user: { id: "user-1", email: "admin@example.com" },
    staff: { id: "super-1", role: "super_admin" as const, ibId: null },
    role: "super_admin" as const
  };
}

function lockedSelectChain(rows: unknown[], shape: "list" | "leads") {
  const resolved = Promise.resolve(rows);
  const forUpdate = vi.fn().mockReturnValue(resolved);
  const where = vi.fn();
  const from = vi.fn().mockReturnValue({ where });
  if (shape === "list") {
    const limit = vi.fn().mockReturnValue({ for: forUpdate });
    where.mockReturnValue({ limit });
    return { from, where, limit, forUpdate };
  }
  const orderBy = vi.fn().mockReturnValue({ for: forUpdate });
  where.mockReturnValue({ orderBy });
  return { from, where, orderBy, forUpdate };
}

function configureTransaction({
  listRows = [{ id: "list-1" }],
  leadRows = [{ id: "lead-1" }, { id: "lead-2" }]
}: {
  listRows?: unknown[];
  leadRows?: unknown[];
} = {}) {
  const listQuery = lockedSelectChain(listRows, "list");
  const leadsQuery = lockedSelectChain(leadRows, "leads");
  const tx = {
    select: vi
      .fn()
      .mockImplementationOnce(() => listQuery)
      .mockImplementationOnce(() => leadsQuery)
  };

  vi.mocked(db.transaction).mockImplementation(
    async (callback) => callback(tx as never) as never
  );

  return { tx, listQuery, leadsQuery };
}

describe("bulk lead assignment transaction boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperActor).mockResolvedValue({
      ok: true,
      staff: staffContext()
    });
    vi.mocked(assignLeadToAgentCore).mockResolvedValue({ ok: true });
    vi.mocked(assignLeadToIbCore).mockResolvedValue({ ok: true });
    vi.mocked(removeLeadAgentCore).mockResolvedValue({ ok: true });
    vi.mocked(removeLeadAssignmentCore).mockResolvedValue({ ok: true });
  });

  it("locks the list and lead snapshot inside one transaction", async () => {
    const { tx, listQuery, leadsQuery } = configureTransaction();

    const result = await assignAllLeadsInList({
      listId: "list-1",
      agentStaffId: "agent-1"
    });

    expect(result).toEqual({ ok: true });
    expect(db.select).not.toHaveBeenCalled();
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(listQuery.forUpdate).toHaveBeenCalledWith("update");
    expect(leadsQuery.forUpdate).toHaveBeenCalledWith("update");
    expect(leadsQuery.orderBy).toHaveBeenCalled();
    expect(assignLeadToAgentCore).toHaveBeenCalledTimes(2);
    expect(revalidateLead).toHaveBeenCalledWith("list-1", "lead-1");
    expect(revalidateLead).toHaveBeenCalledWith("list-1", "lead-2");
    expect(tx.select).toHaveBeenCalledWith(
      expect.objectContaining({ id: leadLists.id })
    );
    expect(tx.select).toHaveBeenCalledWith(
      expect.objectContaining({ id: leads.id })
    );
  });

  it("fails closed when the list is missing inside the transaction", async () => {
    const { tx, leadsQuery } = configureTransaction({ listRows: [] });

    const result = await assignAllLeadsInList({
      listId: "missing-list",
      agentStaffId: "agent-1"
    });

    expect(result).toEqual({ ok: false, error: "Lead list not found." });
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(leadsQuery.forUpdate).not.toHaveBeenCalled();
    expect(assignLeadToAgentCore).not.toHaveBeenCalled();
    expect(revalidateLead).not.toHaveBeenCalled();
  });

  it("returns the failed action after the locked batch rolls back", async () => {
    const { leadsQuery } = configureTransaction();
    vi.mocked(assignLeadToAgentCore)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "Agent not found." });

    const result = await assignAllLeadsInList({
      listId: "list-1",
      agentStaffId: "agent-1"
    });

    expect(result).toEqual({ ok: false, error: "Agent not found." });
    expect(leadsQuery.forUpdate).toHaveBeenCalledWith("update");
    expect(assignLeadToAgentCore).toHaveBeenCalledTimes(2);
    expect(revalidateLead).toHaveBeenCalledTimes(2);
  });

  it("uses the selected strategy for each locked lead", async () => {
    configureTransaction({ leadRows: [{ id: "lead-1" }] });

    const result = await assignAllLeadsInList({
      listId: "list-1",
      ibStaffId: "ib-1"
    });

    expect(result).toEqual({ ok: true });
    expect(assignLeadToIbCore).toHaveBeenCalledWith(
      expect.anything(),
      staffContext(),
      { leadId: "lead-1", ibStaffId: "ib-1" }
    );
  });
});

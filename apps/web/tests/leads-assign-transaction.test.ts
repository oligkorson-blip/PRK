import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { transaction: vi.fn() },
  auditEvents: {},
  investors: {},
  leadAssignments: {},
  leadLists: {},
  leads: {},
  staffProfiles: {}
}));
vi.mock("@/lib/leads/assign/shared", () => ({
  requireActor: vi.fn(),
  requireSuperActor: vi.fn()
}));
vi.mock("@/lib/leads/assign/cores", () => ({
  assignLeadToIbCore: vi.fn(),
  assignLeadToAgentCore: vi.fn(),
  removeLeadAgentCore: vi.fn(),
  removeLeadAssignmentCore: vi.fn()
}));

import { db } from "@/lib/db";
import { requireActor, requireSuperActor } from "@/lib/leads/assign/shared";
import {
  assignLeadToAgentCore,
  assignLeadToIbCore,
  removeLeadAgentCore,
  removeLeadAssignmentCore
} from "@/lib/leads/assign/cores";
import {
  assignLeadToAgent,
  assignLeadToIb,
  removeLeadAgent,
  removeLeadAssignment
} from "@/lib/leads/assign/assign";

const transactionMock = db.transaction as unknown as ReturnType<typeof vi.fn>;

const staff = {
  user: { id: "user-1", email: "admin@example.com" },
  staff: { id: "staff-1", role: "super_admin", ibId: null },
  role: "super_admin"
} as const;

/** Stand-in transaction handle; cores must receive this, never the bare db. */
const tx = { isTx: true };

describe("single-lead assignment actions run inside a transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));
    vi.mocked(requireActor).mockResolvedValue({ ok: true, staff });
    vi.mocked(requireSuperActor).mockResolvedValue({ ok: true, staff });
  });

  it("assignLeadToIb wraps its core in db.transaction", async () => {
    vi.mocked(assignLeadToIbCore).mockResolvedValue({ ok: true });

    const result = await assignLeadToIb({ leadId: "lead-1", ibStaffId: "ib-1" });

    expect(result).toEqual({ ok: true });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(assignLeadToIbCore).toHaveBeenCalledWith(tx, staff, {
      leadId: "lead-1",
      ibStaffId: "ib-1"
    });
  });

  it("assignLeadToAgent wraps its core in db.transaction", async () => {
    vi.mocked(assignLeadToAgentCore).mockResolvedValue({ ok: true });

    const result = await assignLeadToAgent({ leadId: "lead-1", agentStaffId: "agent-1" });

    expect(result).toEqual({ ok: true });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(assignLeadToAgentCore).toHaveBeenCalledWith(tx, staff, {
      leadId: "lead-1",
      agentStaffId: "agent-1"
    });
  });

  it("removeLeadAgent wraps its core in db.transaction", async () => {
    vi.mocked(removeLeadAgentCore).mockResolvedValue({ ok: true });

    const result = await removeLeadAgent({ leadId: "lead-1" });

    expect(result).toEqual({ ok: true });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(removeLeadAgentCore).toHaveBeenCalledWith(tx, staff, { leadId: "lead-1" });
  });

  it("removeLeadAssignment wraps its core in db.transaction", async () => {
    vi.mocked(removeLeadAssignmentCore).mockResolvedValue({ ok: true });

    const result = await removeLeadAssignment({ leadId: "lead-1" });

    expect(result).toEqual({ ok: true });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(removeLeadAssignmentCore).toHaveBeenCalledWith(tx, staff, { leadId: "lead-1" });
  });

  it("passes the core's failure result back unchanged", async () => {
    vi.mocked(assignLeadToIbCore).mockResolvedValue({ ok: false, error: "Lead not found." });

    const result = await assignLeadToIb({ leadId: "lead-1", ibStaffId: "ib-1" });

    expect(result).toEqual({ ok: false, error: "Lead not found." });
  });

  it("skips the transaction entirely when the caller is not authorized", async () => {
    vi.mocked(requireSuperActor).mockResolvedValue({ ok: false, error: "Forbidden." });

    const result = await assignLeadToIb({ leadId: "lead-1", ibStaffId: "ib-1" });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(assignLeadToIbCore).not.toHaveBeenCalled();
  });
});

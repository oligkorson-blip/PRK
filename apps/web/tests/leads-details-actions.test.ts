import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  requireSuperAdmin: vi.fn()
}));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val }))
  };
});

const selectFor = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const auditValues = vi.fn();
const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ for: selectFor }))
    }))
  })),
  update: vi.fn(() => ({
    set: vi.fn((values: unknown) => {
      updateSet(values);
      return { where: updateWhere };
    })
  })),
  insert: vi.fn(() => ({ values: auditValues }))
};

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx))
  },
  auditEvents: {},
  investors: {},
  leadAssignments: {},
  leads: {
    id: "leads.id",
    listId: "leads.list_id",
    ibId: "leads.ib_id",
    assignedAgentId: "leads.assigned_agent_id",
    email: "leads.email"
  },
  staffProfiles: {}
}));

import { requireStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { updateLeadDetails } from "@/lib/leads/assign/details";

const AGENT_LEAD = {
  id: "lead-1",
  listId: "list-1",
  ibId: "ib-1",
  assignedAgentId: "staff-1",
  email: "old.address@example.com"
};

function mockStaff(role: string, staffId = "staff-1") {
  vi.mocked(requireStaff).mockResolvedValue({
    user: { id: "user-1", email: "agent@example.com" },
    staff: { id: staffId, role, ibId: null },
    role
  } as never);
}

const VALID = {
  leadId: "lead-1",
  fullName: "Aoife Byrne",
  email: "AOIFE.byrne@gmail.com ",
  phone: " +353 1 555 0100 ",
  notes: " Met at conference "
};

describe("updateLeadDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStaff("agent");
    selectFor.mockResolvedValue([AGENT_LEAD]);
    updateWhere.mockResolvedValue(undefined);
    auditValues.mockResolvedValue(undefined);
  });

  it("refuses when the lead is not found", async () => {
    selectFor.mockResolvedValueOnce([]);

    const result = await updateLeadDetails(VALID);

    expect(result).toEqual({ ok: false, error: "Lead not found." });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("refuses a lead outside the agent's book", async () => {
    selectFor.mockResolvedValueOnce([
      { ...AGENT_LEAD, assignedAgentId: "someone-else", ibId: "other-ib" }
    ]);

    const result = await updateLeadDetails(VALID);

    expect(result.ok).toBe(false);
    expect(selectFor).toHaveBeenCalledWith("update");
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("validates name and email before writing", async () => {
    expect((await updateLeadDetails({ ...VALID, fullName: "x" })).ok).toBe(false);
    expect((await updateLeadDetails({ ...VALID, email: "not-an-email" })).ok).toBe(false);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("locks scope, normalizes fields, and audits old and new email", async () => {
    const result = await updateLeadDetails(VALID);

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenCalledWith("update");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Aoife Byrne",
        email: "aoife.byrne@gmail.com",
        phone: "+353 1 555 0100",
        notes: "Met at conference"
      })
    );
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead.details_updated",
        entityType: "lead",
        payload: {
          listId: "list-1",
          fromEmail: "old.address@example.com",
          toEmail: "aoife.byrne@gmail.com"
        }
      })
    );
  });

  it("returns a clean error when the email collides with another lead in the list", async () => {
    updateWhere.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key"), { code: "23505" })
    );

    const result = await updateLeadDetails(VALID);

    expect(result).toEqual({
      ok: false,
      error: "Another lead in this list already uses that email."
    });
    expect(auditValues).not.toHaveBeenCalled();
  });

  it("rethrows non-unique database errors from the update", async () => {
    const boom = new Error("connection lost");
    updateWhere.mockRejectedValueOnce(boom);

    await expect(updateLeadDetails(VALID)).rejects.toBe(boom);
  });

  it("stores empty phone and notes as null", async () => {
    await updateLeadDetails({ ...VALID, phone: "  ", notes: "" });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, notes: null })
    );
  });

  it("rolls back the detail update when the audit insert fails", async () => {
    auditValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(updateLeadDetails(VALID)).rejects.toThrow("audit unavailable");

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });
});

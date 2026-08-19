import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  investorVisibleToStaff: vi.fn()
}));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val }))
  };
});

const selectFor = vi.fn();
const noteReturning = vi.fn();
const noteValues = vi.fn(() => ({ returning: noteReturning }));
const auditValues = vi.fn();
const txInsert = vi.fn((table: { table?: string }) =>
  table.table === "investorNotes" ? { values: noteValues } : { values: auditValues }
);
const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ for: selectFor }))
    }))
  })),
  insert: txInsert
};

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx))
  },
  auditEvents: { table: "auditEvents" },
  investorNotes: { table: "investorNotes", id: "investorNotes.id" },
  investors: {
    id: "investors.id",
    assignedAgentId: "investors.assigned_agent_id",
    ibId: "investors.ib_id"
  }
}));

import { revalidatePath } from "next/cache";
import { investorVisibleToStaff, requireStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { addInvestorNote } from "@/lib/investors/note-actions";

const AGENT = {
  user: { id: "user-1", email: "agent@example.com" },
  staff: { id: "staff-1", role: "agent", ibId: "ib-1" },
  role: "agent"
} as const;

describe("addInvestorNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireStaff).mockResolvedValue(AGENT as never);
    vi.mocked(investorVisibleToStaff).mockReturnValue(true);
    selectFor.mockResolvedValue([{ assignedAgentId: "staff-1", ibId: "ib-1" }]);
    noteReturning.mockResolvedValue([{ id: "note-1" }]);
    auditValues.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated callers with a friendly error", async () => {
    vi.mocked(requireStaff).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await addInvestorNote({ investorId: "inv-1", body: "hello" });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns not-found when the investor is out of scope", async () => {
    vi.mocked(investorVisibleToStaff).mockReturnValue(false);

    const result = await addInvestorNote({ investorId: "inv-1", body: "hello" });

    expect(result).toEqual({ ok: false, error: "Investor not found." });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenCalledWith("update");
    expect(txInsert).not.toHaveBeenCalled();
  });

  it("validates the body without inserting", async () => {
    expect(await addInvestorNote({ investorId: "inv-1", body: "   " })).toEqual({
      ok: false,
      error: "Note cannot be empty."
    });
    expect(await addInvestorNote({ investorId: "inv-1", body: "x".repeat(2001) })).toEqual({
      ok: false,
      error: "Note is too long (2000 characters max)."
    });
    expect(txInsert).not.toHaveBeenCalled();
  });

  it("locks scope, inserts the note and audit, then revalidates", async () => {
    const result = await addInvestorNote({
      investorId: "inv-1",
      body: "  Called about ticket size  "
    });

    expect(result).toEqual({ ok: true, noteId: "note-1" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(selectFor).toHaveBeenCalledWith("update");
    expect(noteValues).toHaveBeenCalledWith({
      investorId: "inv-1",
      authorStaffId: "staff-1",
      body: "Called about ticket size"
    });
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "investor.note_added",
        entityType: "investor",
        entityId: "inv-1",
        payload: { noteId: "note-1" }
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/investors/inv-1");
  });

  it("rolls back note creation when the audit insert fails", async () => {
    auditValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(
      addInvestorNote({ investorId: "inv-1", body: "Called about ticket size" })
    ).rejects.toThrow("audit unavailable");

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(noteValues).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

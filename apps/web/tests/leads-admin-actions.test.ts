import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  requireSuperAdmin: vi.fn()
}));
vi.mock("@/lib/db", () => {
  const db = {
    insert: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(db))
  };
  return {
    db,
    auditEvents: {},
    investors: {},
    leadAssignments: {},
    leadLists: {},
    leads: {},
    staffProfiles: {}
  };
});

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { createLeadList, uploadLeadsCsv } from "@/lib/leads/admin-actions";
import { LEADS_CSV_HEADERS } from "@/lib/leads/csv";

const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
const transactionMock = db.transaction as unknown as ReturnType<typeof vi.fn>;

/** Queue one insert chain per db.insert call, in call order. */
function mockInserts(
  chains: Array<{ returning: () => Promise<unknown> } | { values: (v: unknown) => unknown }>
) {
  for (const chain of chains) {
    if ("returning" in chain) {
      insertMock.mockImplementationOnce(() => ({
        values: () => ({ returning: chain.returning })
      }));
    } else {
      insertMock.mockImplementationOnce(() => ({ values: chain.values }));
    }
  }
}

describe("createLeadList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
  });

  it("returns a friendly error when the list name is taken", async () => {
    const duplicate = Object.assign(new Error("duplicate key value"), {
      code: "23505",
      constraint_name: "lead_lists_name_uidx"
    });
    mockInserts([{ returning: () => Promise.reject(duplicate) }]);

    const result = await createLeadList({ name: "Q3 list", defaultSource: "csv" });

    expect(result).toEqual({
      ok: false,
      error: "A list with that name already exists."
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows unexpected database errors", async () => {
    const boom = new Error("connection lost");
    mockInserts([{ returning: () => Promise.reject(boom) }]);

    await expect(
      createLeadList({ name: "Q3 list", defaultSource: "csv" })
    ).rejects.toBe(boom);
  });

  it("creates the list and writes the audit event", async () => {
    const auditValues = vi.fn();
    mockInserts([
      { returning: () => Promise.resolve([{ id: "list-1" }]) },
      { values: auditValues }
    ]);

    const result = await createLeadList({ name: "Q3 list", defaultSource: "csv" });

    expect(result).toEqual({ ok: true, listId: "list-1" });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead_list.created",
        entityId: "list-1",
        payload: { name: "Q3 list", defaultSource: "csv" }
      })
    );
  });

  it("does not revalidate when the list audit insert fails inside the transaction", async () => {
    mockInserts([
      { returning: () => Promise.resolve([{ id: "list-1" }]) },
      { values: () => Promise.reject(new Error("audit unavailable")) }
    ]);

    await expect(
      createLeadList({ name: "Q3 list", defaultSource: "csv" })
    ).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("uploadLeadsCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
  });

  function csvText(...rows: string[]) {
    return [LEADS_CSV_HEADERS.join(","), ...rows].join("\n");
  }

  /** Queue one db.select chain resolving to `rows` (with or without .limit()). */
  function mockSelect(rows: unknown) {
    const whereResult = Object.assign(Promise.resolve(rows), {
      limit: () => Promise.resolve(rows)
    });
    selectMock.mockImplementationOnce(() => ({
      from: () => ({ where: () => whereResult })
    }));
  }

  /** Queue the leads insert chain; returns spies on values() and onConflictDoNothing(). */
  function mockCsvInsert(returning: () => Promise<unknown>) {
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    insertMock.mockImplementationOnce(() => ({ values }));
    return { values, onConflictDoNothing };
  }

  it("returns a friendly error when the list does not exist", async () => {
    mockSelect([]);

    const result = await uploadLeadsCsv({ listId: "list-1", csvText: csvText() });

    expect(result).toEqual({ ok: false, error: "Lead list not found." });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized CSV before touching the database", async () => {
    const big = "x".repeat(5 * 1024 * 1024 + 1);

    const result = await uploadLeadsCsv({ listId: "list-1", csvText: big });

    expect(result).toEqual({ ok: false, error: "CSV must be 5 MB or smaller." });
    expect(selectMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("skips emails already in the list and guards the insert with onConflictDoNothing", async () => {
    mockSelect([{ id: "list-1", defaultSource: "csv" }]);
    mockSelect([{ email: "ada@example.com" }]);
    const csvInsert = mockCsvInsert(() => Promise.resolve([{ id: "lead-1" }]));
    const auditValues = vi.fn();
    mockInserts([{ values: auditValues }]);

    const result = await uploadLeadsCsv({
      listId: "list-1",
      csvText: csvText(
        "Ada Lovelace,ADA@example.com,555-0100,referral,,",
        "Grace Hopper,grace@example.com,,referral,,"
      )
    });

    expect(result).toEqual({ ok: true, imported: 1, skipped: 1, errors: [] });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(csvInsert.values).toHaveBeenCalledWith([
      expect.objectContaining({ listId: "list-1", email: "grace@example.com" })
    ]);
    expect(csvInsert.onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "leads.uploaded",
        entityId: "list-1",
        payload: { imported: 1, skipped: 1, errorCount: 0 }
      })
    );
  });

  it("does not revalidate when the upload audit insert fails inside the transaction", async () => {
    mockSelect([{ id: "list-1", defaultSource: "csv" }]);
    mockSelect([]);
    mockCsvInsert(() => Promise.resolve([{ id: "lead-1" }]));
    mockInserts([
      { values: () => Promise.reject(new Error("audit unavailable")) }
    ]);

    await expect(
      uploadLeadsCsv({
        listId: "list-1",
        csvText: csvText("Ada Lovelace,ada@example.com,555-0100,referral,,")
      })
    ).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("counts only actually-inserted rows when the unique index swallows a race", async () => {
    mockSelect([{ id: "list-1", defaultSource: "csv" }]);
    mockSelect([]);
    mockCsvInsert(() => Promise.resolve([]));
    mockInserts([{ values: vi.fn() }]);

    const result = await uploadLeadsCsv({
      listId: "list-1",
      csvText: csvText("Ada Lovelace,ada@example.com,555-0100,referral,,")
    });

    // A concurrent upload inserted the same row first; onConflictDoNothing made
    // this insert a no-op, so returning yielded nothing.
    expect(result).toEqual({ ok: true, imported: 0, skipped: 0, errors: [] });
  });
});

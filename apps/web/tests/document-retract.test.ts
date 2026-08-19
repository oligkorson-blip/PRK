import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({
  ensureInvestor: vi.fn(),
  requireAdmin: vi.fn()
}));
vi.mock("@/lib/auth/staff", () => ({
  investorVisibleToStaff: vi.fn(() => true),
  requireSuperAdmin: vi.fn()
}));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    isNull: vi.fn((col: unknown) => ({ op: "isNull", col })),
    and: vi.fn((...conditions: unknown[]) => ({ op: "and", conditions }))
  };
});

const selectLimit = vi.fn();
const updateReturning = vi.fn();
const updateWhere = vi.fn(() => ({ returning: updateReturning }));
const insertValues = vi.fn();
const tx = {
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: updateWhere }))
  })),
  insert: vi.fn(() => ({ values: insertValues }))
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: selectLimit }))
      }))
    })),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx))
  },
  assets: {},
  auditEvents: {},
  documents: { id: "documents.id", retractedAt: "documents.retracted_at" }
}));
vi.mock("@/lib/documents/queries", () => ({ loadHoldingOwner: vi.fn() }));
vi.mock("@/lib/storage/local", () => ({
  buildObjectKey: vi.fn(),
  deleteObject: vi.fn(),
  isStorageConfigured: vi.fn(),
  putObject: vi.fn()
}));
vi.mock("@/lib/storage/sniff", () => ({ sniffMatchesType: vi.fn() }));

import { requireSuperAdmin } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { retractDocument } from "@/lib/documents/actions";

const DOC_ID = "11111111-2222-3333-4444-555555555555";

function mockSuperAdmin() {
  vi.mocked(requireSuperAdmin).mockResolvedValue({
    user: { id: "auth-s1", email: "s1@parkwise.test" },
    staff: { id: "s1", role: "super_admin", ibId: null },
    role: "super_admin"
  });
}

const docRow = {
  id: DOC_ID,
  ownerType: "asset",
  ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  title: "KID.pdf",
  category: "kid",
  storageKey: "asset/kid.pdf",
  contentType: "application/pdf",
  uploadedBy: "auth-s1",
  createdAt: new Date("2026-01-01"),
  retractedAt: null
};

describe("retractDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateReturning.mockResolvedValue([{ id: DOC_ID }]);
    insertValues.mockResolvedValue(undefined);
  });

  it("rejects non-super-admin staff", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await retractDocument({ documentId: DOC_ID });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns not found for a non-uuid id without hitting the db", async () => {
    mockSuperAdmin();

    const result = await retractDocument({ documentId: "not-a-uuid" });

    expect(result).toEqual({ ok: false, error: "Document not found." });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns not found when the document does not exist", async () => {
    mockSuperAdmin();
    selectLimit.mockResolvedValue([]);

    const result = await retractDocument({ documentId: DOC_ID });

    expect(result).toEqual({ ok: false, error: "Document not found." });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("sets retractedAt and audits document.retracted in one transaction", async () => {
    mockSuperAdmin();
    selectLimit.mockResolvedValue([docRow]);

    const result = await retractDocument({ documentId: DOC_ID });

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "auth-s1",
        action: "document.retracted",
        entityType: "document",
        entityId: DOC_ID,
        payload: expect.objectContaining({ title: "KID.pdf", ownerType: "asset" })
      })
    );
  });

  it("rolls back the state change when the audit insert fails", async () => {
    mockSuperAdmin();
    selectLimit.mockResolvedValue([docRow]);
    insertValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(retractDocument({ documentId: DOC_ID })).rejects.toThrow("audit unavailable");

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when a concurrent retraction wins the guarded update", async () => {
    mockSuperAdmin();
    selectLimit.mockResolvedValue([docRow]);
    updateReturning.mockResolvedValueOnce([]);

    const result = await retractDocument({ documentId: DOC_ID });

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("is a no-op success for an already-retracted document", async () => {
    mockSuperAdmin();
    selectLimit.mockResolvedValue([{ ...docRow, retractedAt: new Date("2026-02-01") }]);

    const result = await retractDocument({ documentId: DOC_ID });

    expect(result).toEqual({ ok: true });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });
});

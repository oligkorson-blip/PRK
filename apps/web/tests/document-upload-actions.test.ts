import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({
  ensureInvestor: vi.fn(),
  requireAdmin: vi.fn()
}));
vi.mock("@/lib/auth/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/staff")>();
  return { ...actual, requireSuperAdmin: vi.fn() };
});
vi.mock("@/lib/auth/session", () => ({ requireSessionUser: vi.fn() }));
vi.mock("@/lib/db", () => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db))
  };
  return {
  db,
  assets: { id: "assets.id" },
  documents: { table: "documents" },
  investors: {
    id: "investors.id",
    assignedAgentId: "investors.assignedAgentId",
    ibId: "investors.ibId"
  },
  investorApplications: { table: "investorApplications" },
  interests: { table: "interests" },
  holdings: { id: "holdings.id", investorId: "holdings.investorId" },
  staffProfiles: { table: "staffProfiles" },
  auditEvents: { table: "auditEvents" }
  };
});
vi.mock("@/lib/storage/local", () => ({
  buildObjectKey: vi.fn().mockReturnValue("documents/key.pdf"),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  isStorageConfigured: vi.fn().mockReturnValue(true),
  putObject: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/storage/sniff", () => ({ sniffMatchesType: vi.fn().mockResolvedValue(true) }));

import { requireAdmin } from "@/lib/auth/investor";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { db, documents } from "@/lib/db";
import { deleteObject, putObject } from "@/lib/storage/local";
import { adminUploadDocument } from "@/lib/documents/actions";

const ASSET_ID = "11111111-1111-4111-8111-111111111111";
const HOLDING_ID = "22222222-2222-4222-8222-222222222222";

function staff(role: "super_admin" | "agent" | "ib", staffId = "staff-1") {
  return {
    id: "user-1",
    email: "staff@example.com",
    staffId,
    role,
    user: { id: "user-1", email: "staff@example.com" },
    staff: { id: staffId, role, ibId: null }
  };
}

function uploadForm(overrides: { ownerType: string; ownerId?: string }): FormData {
  const data = new FormData();
  data.set("ownerType", overrides.ownerType);
  data.set("ownerId", overrides.ownerId ?? "");
  data.set("title", "KID");
  data.set("category", "KID");
  data.set(
    "file",
    new File(["%PDF-1.4 fake"], "kid.pdf", { type: "application/pdf" })
  );
  return data;
}

/** Drizzle-style select chain resolving to `rows` at `.limit(1)`. */
function mockSelect(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const forUpdate = vi.fn().mockReturnValue(resolved);
  const limit = vi.fn().mockReturnValue(Object.assign(resolved, { for: forUpdate }));
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ where, innerJoin });
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

function mockInsert() {
  vi.mocked(db.insert).mockImplementation(((table: unknown) => {
    if (table === documents) {
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "doc-1" }])
        })
      };
    }
    return { values: vi.fn().mockResolvedValue(undefined) };
  }) as never);
}

describe("adminUploadDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert();
  });

  it("blocks an agent from uploading a platform document", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await adminUploadDocument(uploadForm({ ownerType: "platform" }));

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(putObject).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("blocks an agent from uploading an asset document", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await adminUploadDocument(
      uploadForm({ ownerType: "asset", ownerId: ASSET_ID })
    );

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(putObject).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("allows a super_admin to upload a platform document", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(staff("super_admin") as never);
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "staff@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });

    const result = await adminUploadDocument(uploadForm({ ownerType: "platform" }));

    expect(result).toEqual({ ok: true, id: "doc-1" });
    expect(putObject).toHaveBeenCalledOnce();
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("rolls back the document row and deletes the stored object when auditing fails", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(staff("super_admin") as never);
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "staff@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
    vi.mocked(db.insert)
      .mockImplementationOnce((() => ({
        values: () => ({
          returning: () => Promise.resolve([{ id: "doc-1" }])
        })
      })) as never)
      .mockImplementationOnce((() => ({
        values: () => Promise.reject(new Error("audit unavailable"))
      })) as never);

    const result = await adminUploadDocument(uploadForm({ ownerType: "platform" }));

    expect(result).toEqual({ ok: false, error: "Could not save the document." });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(deleteObject).toHaveBeenCalledWith("documents/key.pdf");
  });

  it("allows a super_admin to upload an asset document", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(staff("super_admin") as never);
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "user-1", email: "staff@example.com" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
    mockSelect([{ id: ASSET_ID }]);

    const result = await adminUploadDocument(
      uploadForm({ ownerType: "asset", ownerId: ASSET_ID })
    );

    expect(result).toEqual({ ok: true, id: "doc-1" });
  });

  it("still allows an agent to upload for a holding in their book (no super-admin gate)", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    mockSelect([{ assignedAgentId: "staff-1", ibId: null }]);

    const result = await adminUploadDocument(
      uploadForm({ ownerType: "holding", ownerId: HOLDING_ID })
    );

    expect(result).toEqual({ ok: true, id: "doc-1" });
    expect(requireSuperAdmin).not.toHaveBeenCalled();
  });

  it("still blocks an agent from uploading for a holding outside their book", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    mockSelect([{ assignedAgentId: "staff-2", ibId: null }]);

    const result = await adminUploadDocument(
      uploadForm({ ownerType: "holding", ownerId: HOLDING_ID })
    );

    expect(result).toEqual({
      ok: false,
      error: "You do not have access to upload for this holding."
    });
    expect(requireSuperAdmin).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });
});

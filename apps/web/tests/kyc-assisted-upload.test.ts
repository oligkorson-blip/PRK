import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
  requireSessionUser: vi.fn()
}));

const selectQueue: unknown[] = [];
const txSelectQueue: unknown[][] = [];
const txAuditValues = vi.fn();
const txFor = vi.fn();

function thenableWithLimit(rows: unknown[]) {
  const promise = Promise.resolve(rows) as Promise<unknown[]> & {
    limit: (n: number) => Promise<unknown[]>;
  };
  promise.limit = vi.fn().mockResolvedValue(rows);
  return promise;
}

function txWhereResult(rows: unknown[]) {
  const promise = Promise.resolve(rows) as Promise<unknown[]> & {
    for: (mode: string) => Promise<unknown[]>;
  };
  promise.for = vi.fn((mode: string) => {
    txFor(mode);
    return Promise.resolve(rows);
  });
  return promise;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => selectQueue.shift() ?? thenableWithLimit([]))
      }))
    })),
    insert: vi.fn(),
    transaction: vi.fn()
  },
  auditEvents: {},
  documents: {},
  investors: {}
}));
vi.mock("@/lib/storage/local", () => ({
  buildObjectKey: vi.fn().mockReturnValue("docs/investor/inv/key.pdf"),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  isStorageConfigured: vi.fn().mockReturnValue(true),
  putObject: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/storage/sniff", () => ({ sniffMatchesType: vi.fn().mockResolvedValue(true) }));

import { requireAdmin } from "@/lib/auth/investor";
import { db, documents } from "@/lib/db";
import { deleteObject, putObject } from "@/lib/storage/local";
import { sniffMatchesType } from "@/lib/storage/sniff";
import { assistedKycUpload } from "@/lib/kyc/assisted-actions";

const INVESTOR_ID = "11111111-1111-4111-8111-111111111111";

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

function uploadForm(overrides?: { category?: string; title?: string; file?: File }): FormData {
  const data = new FormData();
  data.set("category", overrides?.category ?? "kyc_id");
  data.set("title", overrides?.title ?? "");
  data.set(
    "file",
    overrides?.file ?? new File(["%PDF-1.4 fake"], "passport.pdf", { type: "application/pdf" })
  );
  return data;
}

/** Queue the two db.select calls: investor lookup (.limit(1)), then pre-insert cap count. */
function queueInvestor(
  row: { assignedAgentId: string | null; ibId: string | null; kycStatus?: string } | null,
  preCount: unknown[] = []
) {
  selectQueue.push(
    thenableWithLimit(row ? [{ ...row, kycStatus: row.kycStatus ?? "not_started" }] : [])
  );
  selectQueue.push(thenableWithLimit(preCount));
}

const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => txWhereResult(txSelectQueue.shift() ?? []))
    }))
  })),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn((values: unknown) => {
      if (table === documents) {
        return { returning: vi.fn().mockResolvedValue([{ id: "doc-1" }]) };
      }
      txAuditValues(values);
      return Promise.resolve(undefined);
    }
  )}))
};

describe("assistedKycUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue.length = 0;
    txSelectQueue.length = 0;
    // clearAllMocks only clears call history, not implementations — restore
    // the sniff default so mockResolvedValue(false) doesn't leak across tests.
    vi.mocked(sniffMatchesType).mockResolvedValue(true);
    // In-transaction selects: locked scope row, then cap recount.
    txSelectQueue.push([{ assignedAgentId: "staff-1", ibId: null, kycStatus: "not_started" }], []);
    vi.mocked(db.transaction).mockImplementation(
      ((cb: (txArg: typeof tx) => unknown) => Promise.resolve(cb(tx))) as never
    );
    vi.mocked(requireAdmin).mockResolvedValue(staff("agent") as never);
    queueInvestor({ assignedAgentId: "staff-1", ibId: null });
  });

  it("rejects callers without a staff session", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rejects an agent acting on an investor outside their book (no existence oracle)", async () => {
    selectQueue.length = 0;
    queueInvestor({ assignedAgentId: "staff-2", ibId: null });

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("cleans up storage when reassignment removes access before the locked write", async () => {
    // The fast precheck sees the investor in scope. The authoritative locked
    // read observes a later reassignment and must reject the DB insert.
    txSelectQueue.length = 0;
    txSelectQueue.push([{ assignedAgentId: "staff-2", ibId: null, kycStatus: "not_started" }]);

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(putObject).toHaveBeenCalledOnce();
    expect(txFor).toHaveBeenCalledWith("update");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalledWith("docs/investor/inv/key.pdf");
  });

  it("uploads a document for an investor in the agent's book and audits it", async () => {
    const result = await assistedKycUpload(INVESTOR_ID, uploadForm({ title: "Passport" }));

    expect(result).toEqual({ ok: true, id: "doc-1" });
    expect(putObject).toHaveBeenCalledOnce();
    expect(txFor).toHaveBeenCalledWith("update");
    expect(txAuditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "kyc.assisted_upload",
        entityType: "investor",
        entityId: INVESTOR_ID,
        payload: expect.objectContaining({ documentId: "doc-1", staffId: "staff-1" })
      })
    );
  });

  it("rejects files over 10 MB before touching storage", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", {
      type: "application/pdf"
    });

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm({ file: big }));

    expect(result).toEqual({ ok: false, error: "File must be 10 MB or smaller." });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rejects a file whose bytes do not match its declared type", async () => {
    vi.mocked(sniffMatchesType).mockResolvedValue(false);

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "File content does not match its type." });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rejects when the investor already has 10 files", async () => {
    selectQueue.length = 0;
    queueInvestor({ assignedAgentId: "staff-1", ibId: null }, Array.from({ length: 10 }, (_, i) => ({ id: `d${i}` })));

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "This investor already has 10 files." });
    expect(putObject).not.toHaveBeenCalled();
  });

  it("deletes the stored object when the database insert fails", async () => {
    vi.mocked(db.transaction).mockRejectedValueOnce(new Error("db down"));

    const result = await assistedKycUpload(INVESTOR_ID, uploadForm());

    expect(result).toEqual({ ok: false, error: "Could not save the document." });
    expect(deleteObject).toHaveBeenCalledWith("docs/investor/inv/key.pdf");
  });
});

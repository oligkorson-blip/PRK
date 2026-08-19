import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({ ensureInvestor: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/storage/local", () => ({ deleteObject: vi.fn() }));

// Token-returning spies so tests can see the filter (column, value) pairs.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
    and: vi.fn((...conds: unknown[]) => ({ op: "and", conds }))
  };
});

// Erasure writes run inside db.transaction — the mock hands the callback this
// tx so tests can track tx.update/tx.delete calls like the old db ones.
// tx.select serves the investor row lock (SELECT ... FOR UPDATE).
const tx = { update: vi.fn(), delete: vi.fn(), select: vi.fn(), insert: vi.fn() };

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx))
  },
  auditEvents: {},
  documents: {
    id: "documents.id",
    ownerType: "documents.owner_type",
    ownerId: "documents.owner_id",
    storageKey: "documents.storage_key"
  },
  investors: { id: "investors.id", email: "investors.email", authUserId: "investors.auth_user_id" },
  investorApplications: {
    id: "investor_applications.id",
    investorId: "investor_applications.investor_id"
  },
  leads: { id: "leads.id", investorId: "leads.investor_id" },
  session: { userId: "session.user_id" },
  user: { id: "user.id" }
}));

import { requireSuperAdmin } from "@/lib/auth/staff";
import { db, documents, investorApplications, investors, leads, session, user } from "@/lib/db";
import { deleteObject } from "@/lib/storage/local";
import { eraseInvestorAction } from "@/lib/privacy/actions";
import {
  anonymizedInvestorEmail,
  anonymizedLeadEmail,
  AlreadyErasedError,
  eraseInvestorPii as eraseInvestorPiiImpl,
  isErasedInvestorEmail
} from "@/lib/privacy/erasure";

const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
const updateMock = tx.update as unknown as ReturnType<typeof vi.fn>;
const deleteMock = tx.delete as unknown as ReturnType<typeof vi.fn>;
const txSelectMock = tx.select as unknown as ReturnType<typeof vi.fn>;
const transactionMock = db.transaction as unknown as ReturnType<typeof vi.fn>;
const txInsertMock = tx.insert as unknown as ReturnType<typeof vi.fn>;
const deleteObjectMock = vi.mocked(deleteObject);

const INV = "11111111-1111-4111-8111-111111111111";

function eraseInvestorPii(input: { investorId: string; legalHold: boolean }) {
  return eraseInvestorPiiImpl({
    ...input,
    actorUserId: "admin-auth-1",
    legalHoldReason: input.legalHold ? "AML case #7" : null
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectChain(rows: unknown): any {
  const chain = Object.assign(Promise.resolve(rows), {
    limit: () => Promise.resolve(rows),
    for: () => Promise.resolve(rows),
    orderBy: () => chain,
    leftJoin: () => chain,
    where: () => chain
  });
  return chain;
}

/** Queue one db.select chain per call, in call order. */
function mockSelects(results: unknown[]) {
  for (const rows of results) {
    selectMock.mockImplementationOnce(() => ({ from: () => selectChain(rows) }));
  }
}

/** Default row-lock read: a live (not yet erased) investor row. */
function mockRowLock(email = "jane@example.com") {
  txSelectMock.mockImplementation(() => ({ from: () => selectChain([{ email }]) }));
}

type SetCall = { table: unknown; values: Record<string, unknown> };

/** Captures update(table).set(values) calls; where() resolves immediately. */
function trackUpdates(setCalls: SetCall[]) {
  updateMock.mockImplementation((table: unknown) => ({
    set: (values: Record<string, unknown>) => {
      setCalls.push({ table, values });
      return { where: vi.fn().mockResolvedValue([]) };
    }
  }));
}

describe("eraseInvestorPii", () => {
  let setCalls: SetCall[];

  beforeEach(() => {
    vi.clearAllMocks();
    setCalls = [];
    trackUpdates(setCalls);
    deleteMock.mockImplementation(() => ({ where: vi.fn().mockResolvedValue([]) }));
    deleteObjectMock.mockResolvedValue(undefined);
    txInsertMock.mockImplementation(() => ({ values: vi.fn().mockResolvedValue(undefined) }));
    mockRowLock();
  });

  it("anonymises investor and lead PII, then deletes KYC rows and files", async () => {
    mockSelects([
      [{ authUserId: "auth-1" }],
      [{ id: "lead-1" }],
      [{ id: "app-1" }, { id: "app-2" }],
      [
        { id: "doc-1", storageKey: "docs/investor/inv/a.pdf" },
        { id: "doc-2", storageKey: "docs/investor/inv/b.pdf" }
      ]
    ]);

    const outcome = await eraseInvestorPii({ investorId: INV, legalHold: false });

    // Investor row: PII and CDD fields cleared, email stays unique per investor.
    expect(setCalls[0]?.table).toBe(investors);
    expect(setCalls[0]?.values).toEqual({
      email: `erased+${INV}@erased.parkwise.invalid`,
      fullName: "",
      country: "",
      phone: null,
      kycRejectReason: null,
      dateOfBirth: null,
      address: null,
      nationality: null,
      companyLegalName: null,
      countryOfIncorporation: null,
      companyNumber: null,
      eligibilityAnswers: {},
      updatedAt: expect.any(Date)
    });

    // Linked auth user: same erased alias (unique), name blanked — the row
    // stays so investors.authUserId and the export join keep pointing at it.
    expect(setCalls[1]?.table).toBe(user);
    expect(setCalls[1]?.values).toEqual({
      name: "",
      email: `erased+${INV}@erased.parkwise.invalid`,
      updatedAt: expect.any(Date)
    });

    // Linked lead: same treatment, unique erased alias per lead.
    expect(setCalls[2]?.table).toBe(leads);
    expect(setCalls[2]?.values).toEqual({
      fullName: "Erased",
      email: "erased+lead-1@erased.parkwise.invalid",
      phone: null,
      notes: null,
      sourceDetail: null,
      updatedAt: expect.any(Date)
    });

    // Application rows: the same per-investor erased alias as the investor
    // row (so they stay linkable), name/phone/country blanked, nullable PII
    // nulled, free-text investment profile emptied.
    for (const index of [3, 4]) {
      expect(setCalls[index]?.table).toBe(investorApplications);
      expect(setCalls[index]?.values).toEqual({
        firstName: "",
        lastName: "",
        email: `erased+${INV}@erased.parkwise.invalid`,
        phone: "",
        countryOfResidence: "",
        companyLegalName: null,
        countryOfIncorporation: null,
        investmentProfile: {},
        updatedAt: expect.any(Date)
      });
    }

    // Live sessions killed and document rows deleted (both inside the
    // transaction), then the vault files.
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledWith(session);
    expect(deleteMock).toHaveBeenCalledWith(documents);
    expect(deleteObjectMock).toHaveBeenCalledTimes(2);
    expect(deleteObjectMock).toHaveBeenCalledWith("docs/investor/inv/a.pdf");
    expect(deleteObjectMock).toHaveBeenCalledWith("docs/investor/inv/b.pdf");

    expect(outcome).toEqual({
      leadsAnonymized: 1,
      applicationsAnonymized: 2,
      kycDocumentsDeleted: 2,
      kycFilesDeleted: 2
    });
  });

  it("skips the auth user writes when the investor has no linked account", async () => {
    mockSelects([[{ authUserId: null }], [], [], []]);

    await eraseInvestorPii({ investorId: INV, legalHold: false });

    // Investor row anonymised; no user update and no session delete.
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]?.table).toBe(investors);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("wraps every row write in one transaction, files deleted after it commits", async () => {
    mockSelects([
      [{ authUserId: "auth-1" }],
      [{ id: "lead-1" }],
      [{ id: "app-1" }],
      [{ id: "doc-1", storageKey: "docs/investor/inv/a.pdf" }]
    ]);
    let transactionResolved = false;
    transactionMock.mockImplementationOnce(
      async (cb: (txArg: unknown) => Promise<unknown>) => {
        await cb(tx);
        transactionResolved = true;
      }
    );
    deleteObjectMock.mockImplementation(() => {
      // Rows-first/files-last: the unlink must never start before the row
      // delete has committed.
      expect(transactionResolved).toBe(true);
      return Promise.resolve();
    });

    await eraseInvestorPii({ investorId: INV, legalHold: false });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectMock).toHaveBeenCalledTimes(1);
  });

  it("deletes no vault files when the transaction fails", async () => {
    mockSelects([[], [], [], [{ id: "doc-1", storageKey: "docs/investor/inv/a.pdf" }]]);
    transactionMock.mockImplementationOnce(() =>
      Promise.reject(new Error("connection lost"))
    );

    await expect(eraseInvestorPii({ investorId: INV, legalHold: false })).rejects.toThrow(
      "connection lost"
    );

    // The rollback leaves the investor row untouched, so the retry is not
    // blocked by the already-erased email guard — and no file was unlinked.
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("rolls back the erasure and skips vault cleanup when the mandatory audit fails", async () => {
    mockSelects([
      [{ authUserId: "auth-1" }],
      [{ id: "lead-1" }],
      [{ id: "app-1" }],
      [{ id: "doc-1", storageKey: "docs/investor/inv/a.pdf" }]
    ]);
    txInsertMock.mockImplementationOnce(() => ({
      values: () => Promise.reject(new Error("audit unavailable"))
    }));

    await expect(eraseInvestorPii({ investorId: INV, legalHold: false })).rejects.toThrow(
      "audit unavailable"
    );

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("skips KYC deletion entirely under a legal hold", async () => {
    mockSelects([[{ authUserId: "auth-1" }], [{ id: "lead-1" }], [{ id: "app-1" }]]);

    const outcome = await eraseInvestorPii({ investorId: INV, legalHold: true });

    // Investor, auth user, lead and application rows are still anonymised —
    // the hold covers KYC retention only, and applications are not KYC
    // documents.
    expect(setCalls).toHaveLength(4);
    expect(setCalls[3]?.table).toBe(investorApplications);
    expect(setCalls[3]?.values.email).toBe(`erased+${INV}@erased.parkwise.invalid`);
    // Sessions are killed (they are not KYC), but no document rows are deleted.
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(session);
    expect(deleteMock).not.toHaveBeenCalledWith(documents);
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      leadsAnonymized: 1,
      applicationsAnonymized: 1,
      kycDocumentsDeleted: 0,
      kycFilesDeleted: 0
    });
  });

  it("keeps going when a vault file cannot be deleted", async () => {
    mockSelects([
      [],
      [],
      [],
      [
        { id: "doc-1", storageKey: "docs/investor/inv/a.pdf" },
        { id: "doc-2", storageKey: "docs/investor/inv/missing.pdf" }
      ]
    ]);
    deleteObjectMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("ENOENT"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const outcome = await eraseInvestorPii({ investorId: INV, legalHold: false });

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      leadsAnonymized: 0,
      applicationsAnonymized: 0,
      kycDocumentsDeleted: 2,
      kycFilesDeleted: 1
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws AlreadyErasedError when the row lock reveals a committed earlier erasure", async () => {
    // The concurrent double-submit case: this invocation passed the action's
    // pre-check, but under the investor row lock the winner's erased alias is
    // already committed — roll back rather than anonymise a second time.
    mockSelects([[{ authUserId: "auth-1" }], [{ id: "lead-1" }], [{ id: "app-1" }]]);
    mockRowLock(anonymizedInvestorEmail(INV));

    await expect(eraseInvestorPii({ investorId: INV, legalHold: true })).rejects.toBeInstanceOf(
      AlreadyErasedError
    );

    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });
});

describe("eraseInvestorAction", () => {
  let setCalls: SetCall[];

  beforeEach(() => {
    vi.clearAllMocks();
    setCalls = [];
    trackUpdates(setCalls);
    deleteMock.mockImplementation(() => ({ where: vi.fn().mockResolvedValue([]) }));
    deleteObjectMock.mockResolvedValue(undefined);
    txInsertMock.mockImplementation(() => ({ values: vi.fn().mockResolvedValue(undefined) }));
    mockRowLock();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      user: { id: "admin-auth-1", email: "admin@parkwise.test" },
      staff: { id: "staff-1", role: "super_admin", ibId: null },
      role: "super_admin"
    });
  });

  it("rejects non-super-admin callers", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("FORBIDDEN"));

    const result = await eraseInvestorAction({
      investorId: INV,
      confirmEmail: "jane@example.com",
      legalHold: false
    });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a confirmation email that does not match the investor", async () => {
    mockSelects([[{ id: INV, email: "jane@example.com" }]]);

    const result = await eraseInvestorAction({
      investorId: INV,
      confirmEmail: "someone-else@example.com",
      legalHold: false
    });

    expect(result).toEqual({
      ok: false,
      error: "Type the investor's email address to confirm erasure."
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("refuses to erase an already-erased investor", async () => {
    mockSelects([[{ id: INV, email: anonymizedInvestorEmail(INV) }]]);

    const result = await eraseInvestorAction({
      investorId: INV,
      confirmEmail: anonymizedInvestorEmail(INV),
      legalHold: false
    });

    expect(result).toEqual({ ok: false, error: "This investor has already been erased." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns already-erased without a duplicate audit event when a concurrent erasure wins the row lock", async () => {
    const auditValues = vi.fn().mockResolvedValue(undefined);
    txInsertMock.mockImplementation(() => ({ values: auditValues }));
    // The action's pre-check sees a live investor, but a parallel submission
    // commits first: under the row lock the email is already the erased alias.
    mockSelects([
      [{ id: INV, email: "jane@example.com" }],
      [{ authUserId: "auth-1" }],
      [{ id: "lead-1" }],
      [{ id: "app-1" }]
    ]);
    mockRowLock(anonymizedInvestorEmail(INV));

    const result = await eraseInvestorAction({
      investorId: INV,
      confirmEmail: "jane@example.com",
      legalHold: true,
      legalHoldReason: "AML case #7"
    });

    expect(result).toEqual({ ok: false, error: "This investor has already been erased." });
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(auditValues).not.toHaveBeenCalled();
  });

  it("requires a reason when a legal hold is set", async () => {
    mockSelects([[{ id: INV, email: "jane@example.com" }]]);

    const result = await eraseInvestorAction({
      investorId: INV,
      confirmEmail: "jane@example.com",
      legalHold: true,
      legalHoldReason: "  "
    });

    expect(result).toEqual({ ok: false, error: "Give a reason for the legal hold." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("erases and writes the audit event", async () => {
    const auditValues = vi.fn().mockResolvedValue(undefined);
    txInsertMock.mockImplementation(() => ({ values: auditValues }));
    mockSelects([
      [{ id: INV, email: "jane@example.com" }],
      [{ authUserId: "auth-1" }],
      [{ id: "lead-1" }],
      [{ id: "app-1" }],
      [{ id: "doc-1", storageKey: "docs/investor/inv/a.pdf" }]
    ]);

    const result = await eraseInvestorAction({
      investorId: INV,
      confirmEmail: " Jane@example.com ",
      legalHold: false
    });

    expect(result).toEqual({ ok: true });
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-auth-1",
        action: "investor.erased",
        entityType: "investor",
        entityId: INV,
        payload: expect.objectContaining({
          erasedEmail: `erased+${INV}@erased.parkwise.invalid`,
          legalHold: false,
          legalHoldReason: null,
          leadsAnonymized: 1,
          applicationsAnonymized: 1,
          kycDocumentsDeleted: 1,
          kycFilesDeletionRequested: 1
        })
      })
    );
  });

  it("returns a retryable error and skips vault cleanup when the audit transaction fails", async () => {
    mockSelects([
      [{ id: INV, email: "jane@example.com" }],
      [{ authUserId: "auth-1" }],
      [{ id: "lead-1" }],
      [{ id: "app-1" }],
      [{ id: "doc-1", storageKey: "docs/investor/inv/a.pdf" }]
    ]);
    txInsertMock.mockImplementationOnce(() => ({
      values: () => Promise.reject(new Error("audit unavailable"))
    }));

    const result = await eraseInvestorAction({
      investorId: INV,
      confirmEmail: "jane@example.com",
      legalHold: false
    });

    expect(result).toEqual({
      ok: false,
      error: "Could not erase investor. Please try again."
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("records the legal hold reason and keeps KYC documents", async () => {
    const auditValues = vi.fn().mockResolvedValue(undefined);
    txInsertMock.mockImplementation(() => ({ values: auditValues }));
    mockSelects([
      [{ id: INV, email: "jane@example.com" }],
      [],
      [{ id: "lead-1" }],
      [{ id: "app-1" }]
    ]);

    const result = await eraseInvestorAction({
      investorId: INV,
      confirmEmail: "jane@example.com",
      legalHold: true,
      legalHoldReason: "AML case #7"
    });

    expect(result).toEqual({ ok: true });
    expect(deleteMock).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          legalHold: true,
          legalHoldReason: "AML case #7",
          applicationsAnonymized: 1,
          kycDocumentsDeleted: 0
        })
      })
    );
  });
});

describe("erasure email helpers", () => {
  it("builds unique anonymised aliases and detects them", () => {
    expect(anonymizedInvestorEmail(INV)).toBe(`erased+${INV}@erased.parkwise.invalid`);
    expect(anonymizedLeadEmail("lead-9")).toBe("erased+lead-9@erased.parkwise.invalid");
    expect(isErasedInvestorEmail(`ERASED+${INV}@erased.parkwise.invalid`, INV)).toBe(true);
    expect(isErasedInvestorEmail("jane@example.com", INV)).toBe(false);
  });
});

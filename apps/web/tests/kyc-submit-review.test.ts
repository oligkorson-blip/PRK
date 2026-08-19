import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({
  ensureInvestor: vi.fn(),
  requireAdmin: vi.fn()
}));
vi.mock("@/lib/auth/gates", () => ({
  requireCompletedOnboarding: vi.fn()
}));
vi.mock("@/lib/storage/local", () => ({
  buildObjectKey: vi.fn(),
  deleteObject: vi.fn(),
  isStorageConfigured: vi.fn(),
  putObject: vi.fn()
}));
vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: vi.fn()
}));

const lockedInvestorFor = vi.fn();
const documentsFor = vi.fn();
const txUpdateWhere = vi.fn();
const txInsertValues = vi.fn();
let txSelectIndex = 0;

const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: txSelectIndex++ === 0 ? lockedInvestorFor : documentsFor
      }))
    }))
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: txUpdateWhere }))
  })),
  insert: vi.fn(() => ({ values: txInsertValues }))
};

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx))
  },
  auditEvents: {},
  documents: {},
  investors: {}
}));

import { revalidatePath } from "next/cache";
import { ensureInvestor } from "@/lib/auth/investor";
import { db } from "@/lib/db";
import { submitKycForReview } from "@/lib/kyc/actions";
import { KYC_SUBMIT_CONNECTION_ERROR } from "@/lib/copy/kyc";

const sessionInvestor = {
  id: "inv1",
  authUserId: "auth-inv1",
  accountType: "individual",
  accountStatus: "active",
  kycStatus: "rejected",
  onboardingCompletedAt: new Date()
};

const lockedInvestor = {
  id: "inv1",
  authUserId: "auth-inv1",
  accountType: "individual",
  accountStatus: "active",
  kycStatus: "rejected"
};

describe("submitKycForReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txSelectIndex = 0;
    vi.mocked(ensureInvestor).mockResolvedValue(sessionInvestor as never);
    lockedInvestorFor.mockResolvedValue([lockedInvestor]);
    documentsFor.mockResolvedValue([
      { id: "doc-id", category: "kyc_id" },
      { id: "doc-address", category: "kyc_address" }
    ]);
    txUpdateWhere.mockResolvedValue(undefined);
    txInsertValues.mockResolvedValue(undefined);
  });

  it("locks the investor and document pack, then submits and audits atomically", async () => {
    const result = await submitKycForReview();

    expect(result).toEqual({ ok: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(lockedInvestorFor).toHaveBeenCalledWith("update");
    expect(documentsFor).toHaveBeenCalledWith("share");
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "auth-inv1",
        action: "kyc.submitted",
        entityId: "inv1",
        payload: { files: 2 }
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/portal/kyc");
  });

  it("adopts a concurrent submission without updating or auditing twice", async () => {
    lockedInvestorFor.mockResolvedValueOnce([
      { ...lockedInvestor, kycStatus: "submitted" }
    ]);

    const result = await submitKycForReview();

    expect(result).toEqual({ ok: true });
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("does not regress a case that staff already moved under review", async () => {
    lockedInvestorFor.mockResolvedValueOnce([
      { ...lockedInvestor, kycStatus: "under_review" }
    ]);

    const result = await submitKycForReview();

    expect(result).toEqual({
      ok: false,
      error: "Your documents are already under review."
    });
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("validates the live locked document pack before changing status", async () => {
    documentsFor.mockResolvedValueOnce([{ id: "doc-id", category: "kyc_id" }]);

    const result = await submitKycForReview();

    expect(result).toEqual({
      ok: false,
      error: "Upload ID and address proof before submitting."
    });
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("returns a clean error when the audit write aborts the transaction", async () => {
    txInsertValues.mockRejectedValueOnce(new Error("audit unavailable"));

    const result = await submitKycForReview();

    expect(result).toEqual({
      ok: false,
      error: KYC_SUBMIT_CONNECTION_ERROR
    });
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

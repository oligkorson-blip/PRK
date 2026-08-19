import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction, ensureInvestor } = vi.hoisted(() => ({
  transaction: vi.fn(),
  ensureInvestor: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/gates", () => ({ requireCompletedOnboarding: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({ ensureInvestor, requireAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { transaction },
  auditEvents: {},
  documents: {},
  investors: {}
}));
vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/lib/storage/local", () => ({
  buildObjectKey: vi.fn(),
  deleteObject: vi.fn(),
  isStorageConfigured: vi.fn(),
  putObject: vi.fn()
}));
vi.mock("@/lib/storage/sniff", () => ({ sniffMatchesType: vi.fn() }));

import { removeKycDocument } from "@/lib/kyc/actions";

describe("removeKycDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureInvestor.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000001",
      authUserId: "auth-investor-1",
      accountStatus: "active",
      kycStatus: "not_started",
      onboardingStatus: "completed"
    });
  });

  it("rechecks the locked KYC state before changing a file", async () => {
    transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              for: vi.fn().mockResolvedValue([
                { accountStatus: "active", kycStatus: "under_review" }
              ])
            }))
          }))
        }))
      })
    );

    await expect(
      removeKycDocument("00000000-0000-0000-0000-000000000002")
    ).resolves.toEqual({
      ok: false,
      error: "Documents can no longer be changed while they are under review."
    });
    expect(transaction).toHaveBeenCalledOnce();
  });
});

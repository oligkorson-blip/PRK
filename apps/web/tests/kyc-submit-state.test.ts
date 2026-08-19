import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/gates", () => ({ requireCompletedOnboarding: vi.fn() }));
vi.mock("@/lib/auth/investor", () => ({
  ensureInvestor: vi.fn(),
  requireAdmin: vi.fn()
}));
vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              for: vi.fn().mockResolvedValue([
                {
                  id: "investor-1",
                  authUserId: "auth-investor-1",
                  accountType: "individual",
                  accountStatus: "active",
                  kycStatus: "under_review"
                }
              ])
            }))
          }))
        }))
      })
    )
  },
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

import { ensureInvestor } from "@/lib/auth/investor";
import { submitKycForReview } from "@/lib/kyc/actions";

describe("submitKycForReview state guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not regress an active under-review submission", async () => {
    vi.mocked(ensureInvestor).mockResolvedValue({
      id: "investor-1",
      accountStatus: "active",
      kycStatus: "under_review",
      onboardingStatus: "completed",
      termsAcceptedAt: new Date(),
      riskAcceptedAt: new Date()
    } as never);

    await expect(submitKycForReview()).resolves.toEqual({
      ok: false,
      error: "Your documents are already under review."
    });
  });
});

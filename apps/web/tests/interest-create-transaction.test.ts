import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const txSelect = vi.fn();
  const txInsert = vi.fn();
  const tx = { select: txSelect, insert: txInsert };

  return {
    select: vi.fn(),
    txSelect,
    txInsert,
    transaction: vi.fn(async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx))
  };
});

vi.mock("@/lib/auth/investor", () => ({ ensureInvestor: vi.fn() }));
vi.mock("@/lib/auth/gates", () => ({
  canExpressInterest: vi.fn(),
  isOnboardingComplete: vi.fn()
}));
vi.mock("@/lib/assets/funding", () => ({ fundingForAssets: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction
  },
  assets: {},
  auditEvents: {},
  interests: {},
  investors: {},
  platformSettings: {}
}));

import { ensureInvestor } from "@/lib/auth/investor";
import { canExpressInterest, isOnboardingComplete } from "@/lib/auth/gates";
import { fundingForAssets } from "@/lib/assets/funding";
import { sendTransactionalEmail } from "@/lib/email/send";
import { createInterest } from "@/lib/interests/actions";
import { MAX_INTERESTS_PER_DAY } from "@/lib/interests/rate-limit";

const investor = {
  id: "investor-1",
  authUserId: "investor-auth-1",
  email: "investor@parkwise.test",
  onboardingStatus: "completed",
  accountStatus: "active",
  termsAcceptedAt: new Date("2026-01-01"),
  riskAcceptedAt: new Date("2026-01-01")
};

const asset = {
  id: "asset-1",
  slug: "dublin-central",
  name: "Dublin Central",
  status: "published",
  minTicketEur: 1_000,
  advisoryCapacityEur: 1_000_000,
  investmentOptions: []
};

function mockDbSelectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const node: Record<string, unknown> = {};
  node.from = vi.fn(() => node);
  node.where = vi.fn(() => ({ limit }));
  mocks.select.mockImplementationOnce(() => node);
}

function mockTransaction(input: {
  todaysInterests?: unknown[];
  inserted?: { id: string };
  insertError?: unknown;
  auditError?: unknown;
}) {
  // A daily-cap rejection intentionally leaves queued insert implementations
  // unused, so reset transaction-local queues before configuring each case.
  mocks.txSelect.mockReset();
  mocks.txInsert.mockReset();

  const todaysInterests = input.todaysInterests ?? [];
  const inserted = input.inserted ?? { id: "interest-new" };

  mocks.txSelect
    .mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: () => Promise.resolve([{ id: investor.id }])
          })
        })
      })
    }))
    .mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve(todaysInterests)
      })
    }));

  const interestValues = vi.fn(() => ({
    returning: () =>
      input.insertError ? Promise.reject(input.insertError) : Promise.resolve([inserted])
  }));
  const auditValues = vi.fn(() =>
    input.auditError ? Promise.reject(input.auditError) : Promise.resolve()
  );

  mocks.txInsert
    .mockImplementationOnce(() => ({ values: interestValues }))
    .mockImplementationOnce(() => ({ values: auditValues }));

  return { interestValues, auditValues };
}

describe("transactional interest creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPS_INBOX_EMAIL", "");

    vi.mocked(ensureInvestor).mockResolvedValue(investor as never);
    vi.mocked(isOnboardingComplete).mockReturnValue(true);
    vi.mocked(canExpressInterest).mockReturnValue(true);
    vi.mocked(fundingForAssets).mockResolvedValue(
      new Map([[asset.id, { open: true }]]) as never
    );

    mockDbSelectRows([{ enabled: true }]);
    mockDbSelectRows([asset]);
    mockDbSelectRows([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates the interest and audit event through the same transaction", async () => {
    const { interestValues, auditValues } = mockTransaction({});

    const result = await createInterest({
      assetSlug: asset.slug,
      amountEur: 1_250,
      riskAcknowledged: true
    });

    expect(result).toEqual({ ok: true, interestId: "interest-new" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txInsert).toHaveBeenCalledTimes(2);
    expect(interestValues).toHaveBeenCalledWith(
      expect.objectContaining({
        investorId: investor.id,
        assetId: asset.id,
        amountEur: 1_250
      })
    );
    expect(auditValues).toHaveBeenCalledWith({
      actorUserId: investor.authUserId,
      action: "interest.created",
      entityType: "interest",
      entityId: "interest-new",
      payload: {
        assetSlug: asset.slug,
        amountEur: 1_250,
        optionId: null
      }
    });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("propagates an audit failure from inside the transaction and sends no email", async () => {
    mockTransaction({ auditError: new Error("audit unavailable") });

    await expect(
      createInterest({
        assetSlug: asset.slug,
        amountEur: 1_250,
        riskAcknowledged: true
      })
    ).rejects.toThrow("audit unavailable");

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects the daily cap before inserting either financial row", async () => {
    mockTransaction({
      todaysInterests: Array.from({ length: MAX_INTERESTS_PER_DAY }, (_, index) => ({
        id: `existing-${index}`
      }))
    });

    const result = await createInterest({
      assetSlug: asset.slug,
      amountEur: 1_250,
      riskAcknowledged: true
    });

    expect(result).toEqual({
      ok: false,
      error: `You've reached the limit of ${MAX_INTERESTS_PER_DAY} interests per day. Please try again tomorrow.`
    });
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("keeps the duplicate pending-interest race as a soft error", async () => {
    mockTransaction({
      insertError: Object.assign(new Error("duplicate key value"), { code: "23505" })
    });

    const result = await createInterest({
      assetSlug: asset.slug,
      amountEur: 1_250,
      riskAcknowledged: true
    });

    expect(result).toEqual({
      ok: false,
      error: "You already have a pending interest in this asset."
    });
    expect(mocks.txInsert).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

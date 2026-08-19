import { beforeEach, describe, expect, it, vi } from "vitest";

const selectLimit = vi.fn();
const selectFor = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const updateReturning = vi.fn();
const deleteWhere = vi.fn();
const insertValues = vi.fn();

vi.mock("@/lib/db", () => {
  const limit = vi.fn((...args: unknown[]) => ({
    for: (...forArgs: unknown[]) => selectFor(...forArgs),
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(selectLimit(...args)).then(resolve, reject)
  }));
  const operations = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit }))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: unknown) => {
        updateSet(value);
        return { where: updateWhere };
      })
    })),
    delete: vi.fn(() => ({ where: deleteWhere })),
    insert: vi.fn(() => ({ values: insertValues }))
  };

  return {
    db: {
      ...operations,
      transaction: vi.fn(async (fn: (txArg: unknown) => Promise<unknown>) => fn(operations))
    },
    account: {},
    auditEvents: {},
    inviteTokens: {},
    investors: {},
    session: {}
  };
});

vi.mock("better-auth/crypto", () => ({
  hashPassword: vi.fn(async () => "hashed-password")
}));

import { db } from "@/lib/db";
import { setPasswordWithInvite } from "@/lib/apply/set-password";

const transactionMock = db.transaction as unknown as ReturnType<typeof vi.fn>;

describe("setPasswordWithInvite password policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLimit.mockReset();
    selectFor.mockReset();
  });

  it("rejects passwords shorter than the shared minimum", async () => {
    const result = await setPasswordWithInvite({ token: "t", password: "short" });

    expect(result).toEqual({ ok: false, error: "Password must be at least 10 characters." });
    expect(selectLimit).not.toHaveBeenCalled();
  });

  it("rejects passwords longer than the shared maximum", async () => {
    const result = await setPasswordWithInvite({ token: "t", password: "x".repeat(129) });

    expect(result).toEqual({ ok: false, error: "Password must be at most 128 characters." });
    expect(selectLimit).not.toHaveBeenCalled();
  });
});

describe("setPasswordWithInvite success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLimit.mockReset();
    selectFor.mockReset();
  });

  it("returns the investor email so the client can sign in directly", async () => {
    selectLimit
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }])
      .mockResolvedValueOnce([{ authUserId: "auth-1" }]);
    selectFor
      .mockResolvedValueOnce([
        { id: "inv-1", authUserId: "auth-1", email: "investor@example.com" }
      ])
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }]);
    // Awaiting a plain object resolves immediately, so one where() result
    // serves both the account update (.returning) and the invite update.
    updateWhere.mockReturnValue({ returning: updateReturning });
    updateReturning.mockResolvedValue([{ id: "acc-1" }]);
    insertValues.mockResolvedValue(undefined);

    const result = await setPasswordWithInvite({
      token: "token-abc",
      password: "valid-password-1"
    });

    expect(result).toEqual({ ok: true, email: "investor@example.com" });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    // Activation marker: the credential update stamps passwordSetAt so a
    // second invite for this account is rejected.
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ passwordSetAt: expect.any(Date) })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "investor.password_set", entityId: "inv-1" })
    );
  });

  it("revokes the user's existing sessions after a successful password set", async () => {
    selectLimit
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }])
      .mockResolvedValueOnce([{ authUserId: "auth-1" }]);
    selectFor
      .mockResolvedValueOnce([
        { id: "inv-1", authUserId: "auth-1", email: "investor@example.com" }
      ])
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }]);
    updateWhere.mockReturnValue({ returning: updateReturning });
    updateReturning.mockResolvedValue([{ id: "acc-1" }]);
    deleteWhere.mockResolvedValue(undefined);
    insertValues.mockResolvedValue(undefined);

    await setPasswordWithInvite({ token: "token-abc", password: "valid-password-1" });

    // One delete, scoped to the session table's userId for the auth user.
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it("does not report success when the activation audit insert fails", async () => {
    selectLimit
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }])
      .mockResolvedValueOnce([{ authUserId: "auth-1" }]);
    selectFor
      .mockResolvedValueOnce([
        { id: "inv-1", authUserId: "auth-1", email: "investor@example.com" }
      ])
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }]);
    updateWhere.mockReturnValue({ returning: updateReturning });
    updateReturning.mockResolvedValue([{ id: "acc-1" }]);
    deleteWhere.mockResolvedValue(undefined);
    insertValues.mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(
      setPasswordWithInvite({ token: "token-abc", password: "valid-password-1" })
    ).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it("does not revoke sessions when the invite is expired or invalid", async () => {
    selectLimit.mockResolvedValueOnce([]);

    const result = await setPasswordWithInvite({
      token: "token-abc",
      password: "valid-password-1"
    });

    expect(result).toEqual({
      ok: false,
      error: "Invite expired or invalid. Ask your advisor for a new invite."
    });
    expect(deleteWhere).not.toHaveBeenCalled();
  });
});

describe("setPasswordWithInvite activation gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLimit.mockReset();
    selectFor.mockReset();
  });

  it("rejects an invite for an already-activated account without touching it", async () => {
    selectLimit
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }])
      .mockResolvedValueOnce([{ authUserId: "auth-1" }])
      // Follow-up lookup after the isNull(passwordSetAt) guard matched no row.
      .mockResolvedValueOnce([{ passwordSetAt: new Date() }]);
    selectFor
      .mockResolvedValueOnce([
        { id: "inv-1", authUserId: "auth-1", email: "investor@example.com" }
      ])
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }]);
    updateWhere.mockReturnValue({ returning: updateReturning });
    updateReturning.mockResolvedValue([]);

    const result = await setPasswordWithInvite({
      token: "token-abc",
      password: "valid-password-1"
    });

    expect(result).toEqual({
      ok: false,
      error: "This account is already activated. Sign in or use forgot password to reset it."
    });
    // Only the guarded account update ran: the invite stays unused, sessions
    // survive and no audit event is written for a rejected attempt.
    expect(updateWhere).toHaveBeenCalledTimes(1);
    expect(deleteWhere).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("rejects a token that was invalidated before the activation lock", async () => {
    selectLimit
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }])
      .mockResolvedValueOnce([{ authUserId: "auth-1" }]);
    selectFor
      .mockResolvedValueOnce([
        { id: "inv-1", authUserId: "auth-1", email: "investor@example.com" }
      ])
      .mockResolvedValueOnce([]);

    const result = await setPasswordWithInvite({
      token: "token-abc",
      password: "valid-password-1"
    });

    expect(result).toEqual({
      ok: false,
      error: "Invite expired or invalid. Ask your advisor for a new invite."
    });
    expect(updateWhere).not.toHaveBeenCalled();
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("keeps the generic error when the credential account row is missing", async () => {
    selectLimit
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }])
      .mockResolvedValueOnce([{ authUserId: "auth-1" }])
      .mockResolvedValueOnce([]);
    selectFor
      .mockResolvedValueOnce([
        { id: "inv-1", authUserId: "auth-1", email: "investor@example.com" }
      ])
      .mockResolvedValueOnce([{ id: "invite-1", investorId: "inv-1" }]);
    updateWhere.mockReturnValue({ returning: updateReturning });
    updateReturning.mockResolvedValue([]);

    const result = await setPasswordWithInvite({
      token: "token-abc",
      password: "valid-password-1"
    });

    expect(result).toEqual({ ok: false, error: "We couldn't update your password just yet. Please try again, or contact the team if it continues." });
    expect(deleteWhere).not.toHaveBeenCalled();
  });
});

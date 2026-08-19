import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  dbInsert: vi.fn(),
  transaction: vi.fn(),
  txInsert: vi.fn(),
  txValues: vi.fn(),
  profileReturning: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/staff", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({
  effectiveStaffRole: vi.fn(),
  isSuperAdminEmail: vi.fn()
}));
vi.mock("@/lib/staff/shared", () => ({
  findAuthUserByEmail: vi.fn(),
  loadIbOrError: vi.fn(),
  normalizeEmail: vi.fn((email: string) => email.trim().toLowerCase())
}));
vi.mock("@/lib/db", () => ({
  auditEvents: { id: "audit_events.id" },
  staffProfiles: {
    id: "staff_profiles.id",
    authUserId: "staff_profiles.auth_user_id",
    role: "staff_profiles.role"
  },
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mocks.selectLimit }))
      }))
    })),
    insert: mocks.dbInsert,
    transaction: mocks.transaction
  }
}));

import { effectiveStaffRole, isSuperAdminEmail } from "@/lib/auth/roles";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { promoteToAgent, promoteToIb } from "@/lib/staff/promote-actions";
import { findAuthUserByEmail, loadIbOrError } from "@/lib/staff/shared";

const actor = {
  user: { id: "admin-auth-1", email: "admin@example.com" },
  staff: { id: "admin-staff-1", role: "super_admin" as const, ibId: null },
  role: "super_admin" as const
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSuperAdmin).mockResolvedValue(actor);
  vi.mocked(isSuperAdminEmail).mockReturnValue(false);
  vi.mocked(effectiveStaffRole).mockReturnValue(null);
  vi.mocked(findAuthUserByEmail).mockResolvedValue({
    id: "target-auth-1",
    email: "target@example.com"
  });
  vi.mocked(loadIbOrError).mockResolvedValue({ ok: true, id: "ib-staff-1" });
  mocks.selectLimit.mockResolvedValue([]);
  mocks.profileReturning.mockResolvedValue([{ id: "target-staff-1" }]);
  mocks.txInsert.mockImplementation(() => ({ values: mocks.txValues }));
  mocks.txValues.mockImplementation((values: Record<string, unknown>) => {
    if ("action" in values) return Promise.resolve(undefined);
    return {
      onConflictDoUpdate: vi.fn(() => ({ returning: mocks.profileReturning }))
    };
  });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ insert: mocks.txInsert })
  );
});

describe("staff promotion transactions", () => {
  it("commits an IB privilege grant and its audit event through one transaction", async () => {
    const result = await promoteToIb({ email: " Target@example.com " });

    expect(result).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.dbInsert).not.toHaveBeenCalled();
    expect(mocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: "target-auth-1",
        email: "target@example.com",
        role: "ib"
      })
    );
    expect(mocks.txValues).toHaveBeenCalledWith({
      actorUserId: "admin-auth-1",
      action: "staff.promoted",
      entityType: "staff_profile",
      entityId: "target-staff-1",
      payload: { email: "target@example.com", role: "ib" }
    });
  });

  it("commits an agent privilege grant and its audit event through one transaction", async () => {
    const result = await promoteToAgent({
      email: "target@example.com",
      ibStaffId: "ib-staff-1"
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.dbInsert).not.toHaveBeenCalled();
    expect(mocks.txValues).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: "target-auth-1",
        email: "target@example.com",
        role: "agent",
        ibId: "ib-staff-1"
      })
    );
    expect(mocks.txValues).toHaveBeenCalledWith({
      actorUserId: "admin-auth-1",
      action: "staff.promoted",
      entityType: "staff_profile",
      entityId: "target-staff-1",
      payload: {
        email: "target@example.com",
        role: "agent",
        ibStaffId: "ib-staff-1"
      }
    });
  });

  it("returns a clean error so an audit failure rolls the privilege grant back", async () => {
    mocks.txValues.mockImplementation((values: Record<string, unknown>) => {
      if ("action" in values) return Promise.reject(new Error("audit unavailable"));
      return {
        onConflictDoUpdate: vi.fn(() => ({ returning: mocks.profileReturning }))
      };
    });

    const result = await promoteToIb({ email: "target@example.com" });

    expect(result).toEqual({ ok: false, error: "Could not promote staff. Try again." });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("does not audit or report success when the profile upsert returns no row", async () => {
    mocks.profileReturning.mockResolvedValue([]);

    const result = await promoteToAgent({
      email: "target@example.com",
      ibStaffId: "ib-staff-1"
    });

    expect(result).toEqual({ ok: false, error: "Could not promote staff. Try again." });
    expect(
      mocks.txValues.mock.calls.some(([values]) =>
        Boolean(values && typeof values === "object" && "action" in values)
      )
    ).toBe(false);
  });
});

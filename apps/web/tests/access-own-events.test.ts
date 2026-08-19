import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
  requireSessionUser: vi.fn()
}));
vi.mock("@/lib/auth/staff", () => ({
  requireStaff: vi.fn(),
  investorVisibleToStaff: vi.fn()
}));

// vi.hoisted: the "@/lib/db" factory below runs when lib/access/queries is
// imported, before module-level consts would otherwise be initialized (TDZ).
const { limitMock, orderByMock, whereMock, fromMock, selectMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const orderByMock = vi.fn(() => ({ limit: limitMock }));
  const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return { limitMock, orderByMock, whereMock, fromMock, selectMock };
});

vi.mock("@/lib/db", () => ({
  db: { select: selectMock },
  staffProfiles: {},
  userAccessEvents: {},
  investors: {}
}));

import { listOwnAccessEvents } from "@/lib/access/queries";
import { requireSessionUser } from "@/lib/auth/session";

describe("listOwnAccessEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries access events for the signed-in user, newest first, capped", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue({ id: "u1", email: "a@b.c" });
    limitMock.mockResolvedValue([{ id: "ev1" }]);

    const events = await listOwnAccessEvents();

    expect(events).toEqual([{ id: "ev1" }]);
    expect(requireSessionUser).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(limitMock).toHaveBeenCalledWith(10);
  });

  it("honours an explicit limit", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue({ id: "u1", email: "a@b.c" });
    limitMock.mockResolvedValue([]);

    await listOwnAccessEvents(3);

    expect(limitMock).toHaveBeenCalledWith(3);
  });

  it("propagates the unauthenticated error", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(listOwnAccessEvents()).rejects.toThrow("UNAUTHENTICATED");
    expect(selectMock).not.toHaveBeenCalled();
  });
});

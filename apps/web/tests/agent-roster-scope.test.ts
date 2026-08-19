import { describe, expect, it } from "vitest";
import { agentRosterScopeForStaff } from "@/lib/auth/staff";

describe("agent roster scope", () => {
  it("lets super admins view the full roster by default", () => {
    expect(
      agentRosterScopeForStaff({
        role: "super_admin",
        staffId: "super-1"
      })
    ).toEqual({ allowed: true, ibId: null });
  });

  it("lets super admins filter the roster to a selected IB", () => {
    expect(
      agentRosterScopeForStaff({
        role: "super_admin",
        staffId: "super-1",
        requestedIbId: "ib-2"
      })
    ).toEqual({ allowed: true, ibId: "ib-2" });
  });

  it("locks IB roster access to the signed-in IB's own team", () => {
    expect(
      agentRosterScopeForStaff({
        role: "ib",
        staffId: "ib-1",
        requestedIbId: "ib-2"
      })
    ).toEqual({ allowed: true, ibId: "ib-1" });
  });

  it("keeps an IB scoped to its own team without a requested filter", () => {
    expect(
      agentRosterScopeForStaff({
        role: "ib",
        staffId: "ib-1"
      })
    ).toEqual({ allowed: true, ibId: "ib-1" });
  });

  it("prevents agents from enumerating the staff roster", () => {
    expect(
      agentRosterScopeForStaff({
        role: "agent",
        staffId: "agent-1",
        requestedIbId: "ib-2"
      })
    ).toEqual({ allowed: false, ibId: null });
  });
});

import { describe, expect, it } from "vitest";
import { leadManageableByIb, leadVisibleToStaff } from "@/lib/leads/scope";

describe("lead role scope", () => {
  it("allows super admins to see unassigned and assigned leads", () => {
    expect(
      leadVisibleToStaff({
        role: "super_admin",
        staffId: "super-1",
        lead: { ibId: null, assignedAgentId: null }
      })
    ).toBe(true);

    expect(
      leadVisibleToStaff({
        role: "super_admin",
        staffId: "super-1",
        lead: { ibId: "ib-1", assignedAgentId: "agent-1" }
      })
    ).toBe(true);
  });

  it("allows an IB to see its queue and every lead owned by its agents", () => {
    expect(
      leadVisibleToStaff({
        role: "ib",
        staffId: "ib-1",
        lead: { ibId: "ib-1", assignedAgentId: null }
      })
    ).toBe(true);

    expect(
      leadVisibleToStaff({
        role: "ib",
        staffId: "ib-1",
        lead: { ibId: "ib-1", assignedAgentId: "agent-1" }
      })
    ).toBe(true);

    expect(
      leadVisibleToStaff({
        role: "ib",
        staffId: "ib-1",
        lead: { ibId: "ib-2", assignedAgentId: "agent-9" }
      })
    ).toBe(false);
  });

  it("allows an agent to see only leads directly assigned to that agent", () => {
    expect(
      leadVisibleToStaff({
        role: "agent",
        staffId: "agent-1",
        lead: { ibId: "ib-1", assignedAgentId: "agent-1" }
      })
    ).toBe(true);

    expect(
      leadVisibleToStaff({
        role: "agent",
        staffId: "agent-1",
        lead: { ibId: "ib-1", assignedAgentId: null }
      })
    ).toBe(false);

    expect(
      leadVisibleToStaff({
        role: "agent",
        staffId: "agent-1",
        lead: { ibId: "ib-1", assignedAgentId: "agent-2" }
      })
    ).toBe(false);
  });

  it("allows assignment management only to the owning IB", () => {
    expect(
      leadManageableByIb({
        role: "ib",
        staffId: "ib-1",
        lead: { ibId: "ib-1" }
      })
    ).toBe(true);

    expect(
      leadManageableByIb({
        role: "ib",
        staffId: "ib-1",
        lead: { ibId: "ib-2" }
      })
    ).toBe(false);

    expect(
      leadManageableByIb({
        role: "agent",
        staffId: "agent-1",
        lead: { ibId: "ib-1" }
      })
    ).toBe(false);
  });
});

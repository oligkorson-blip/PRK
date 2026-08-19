import { describe, expect, it } from "vitest";
import { leadVisibleToStaff } from "@/lib/leads/scope";

describe("leadVisibleToStaff", () => {
  it("super_admin sees unassigned and any book", () => {
    expect(
      leadVisibleToStaff({
        role: "super_admin",
        staffId: "s1",
        lead: { assignedAgentId: null, ibId: null }
      })
    ).toBe(true);
    expect(
      leadVisibleToStaff({
        role: "super_admin",
        staffId: "s1",
        lead: { assignedAgentId: "other", ibId: "ib1" }
      })
    ).toBe(true);
  });

  it("agent only sees own assignments", () => {
    expect(
      leadVisibleToStaff({
        role: "agent",
        staffId: "a1",
        lead: { assignedAgentId: "a1", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      leadVisibleToStaff({
        role: "agent",
        staffId: "a1",
        lead: { assignedAgentId: null, ibId: "ib1" }
      })
    ).toBe(false);
    expect(
      leadVisibleToStaff({
        role: "agent",
        staffId: "a1",
        lead: { assignedAgentId: "a2", ibId: "ib1" }
      })
    ).toBe(false);
  });

  it("ib sees its queue and whole team book, not other teams", () => {
    expect(
      leadVisibleToStaff({
        role: "ib",
        staffId: "ib1",
        lead: { assignedAgentId: null, ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      leadVisibleToStaff({
        role: "ib",
        staffId: "ib1",
        lead: { assignedAgentId: "a9", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      leadVisibleToStaff({
        role: "ib",
        staffId: "ib1",
        lead: { assignedAgentId: "a1", ibId: "ib2" }
      })
    ).toBe(false);
    expect(
      leadVisibleToStaff({
        role: "ib",
        staffId: "ib1",
        lead: { assignedAgentId: null, ibId: null }
      })
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { investorVisibleToStaff } from "@/lib/auth/staff";

describe("investorVisibleToStaff", () => {
  it("super_admin sees unassigned and any book", () => {
    expect(
      investorVisibleToStaff({
        role: "super_admin",
        staffId: "s1",
        investor: { assignedAgentId: null, ibId: null }
      })
    ).toBe(true);
    expect(
      investorVisibleToStaff({
        role: "super_admin",
        staffId: "s1",
        investor: { assignedAgentId: "other", ibId: "ib1" }
      })
    ).toBe(true);
  });

  it("agent only sees own assignments", () => {
    expect(
      investorVisibleToStaff({
        role: "agent",
        staffId: "a1",
        investor: { assignedAgentId: "a1", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      investorVisibleToStaff({
        role: "agent",
        staffId: "a1",
        investor: { assignedAgentId: null, ibId: "ib1" }
      })
    ).toBe(false);
    expect(
      investorVisibleToStaff({
        role: "agent",
        staffId: "a1",
        investor: { assignedAgentId: "a2", ibId: "ib1" }
      })
    ).toBe(false);
  });

  it("ib sees investors linked to its team, not other teams", () => {
    expect(
      investorVisibleToStaff({
        role: "ib",
        staffId: "ib1",
        investor: { assignedAgentId: "a9", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      investorVisibleToStaff({
        role: "ib",
        staffId: "ib1",
        investor: { assignedAgentId: "a1", ibId: "ib2" }
      })
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { authUserVisibleToStaff } from "@/lib/access/scope";

describe("authUserVisibleToStaff", () => {
  it("allows agent for assigned investor only", () => {
    expect(
      authUserVisibleToStaff({
        role: "agent",
        staffId: "a1",
        target: { kind: "investor", assignedAgentId: "a1", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      authUserVisibleToStaff({
        role: "agent",
        staffId: "a1",
        target: { kind: "investor", assignedAgentId: "a2", ibId: "ib1" }
      })
    ).toBe(false);
  });

  it("blocks agents from staff targets", () => {
    expect(
      authUserVisibleToStaff({
        role: "agent",
        staffId: "a1",
        target: { kind: "staff" }
      })
    ).toBe(false);
  });

  it("allows super_admin for staff and any investor", () => {
    expect(
      authUserVisibleToStaff({
        role: "super_admin",
        staffId: "s1",
        target: { kind: "staff" }
      })
    ).toBe(true);
  });

  it("allows ib for team investors only", () => {
    expect(
      authUserVisibleToStaff({
        role: "ib",
        staffId: "ib1",
        target: { kind: "investor", assignedAgentId: "a9", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      authUserVisibleToStaff({
        role: "ib",
        staffId: "ib1",
        target: { kind: "investor", assignedAgentId: "a1", ibId: "ib2" }
      })
    ).toBe(false);
    expect(
      authUserVisibleToStaff({
        role: "ib",
        staffId: "ib1",
        target: { kind: "staff" }
      })
    ).toBe(false);
  });
});

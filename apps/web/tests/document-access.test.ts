import { describe, expect, it } from "vitest";
import { canAccessDocument, staffCanAccessAdminDocument } from "@/lib/documents/access";

describe("canAccessDocument", () => {
  const investorId = "inv-1";

  it("allows platform docs for any investor", () => {
    expect(
      canAccessDocument({
        doc: { ownerType: "platform", ownerId: null },
        investorId,
        relatedAssetIds: new Set(),
        ownedHoldingIds: new Set()
      })
    ).toBe(true);
  });

  it("allows asset docs only when related", () => {
    expect(
      canAccessDocument({
        doc: { ownerType: "asset", ownerId: "a1" },
        investorId,
        relatedAssetIds: new Set(["a1"]),
        ownedHoldingIds: new Set()
      })
    ).toBe(true);
    expect(
      canAccessDocument({
        doc: { ownerType: "asset", ownerId: "a2" },
        investorId,
        relatedAssetIds: new Set(["a1"]),
        ownedHoldingIds: new Set()
      })
    ).toBe(false);
  });

  it("allows holding docs only for owned holdings", () => {
    expect(
      canAccessDocument({
        doc: { ownerType: "holding", ownerId: "h1" },
        investorId,
        relatedAssetIds: new Set(),
        ownedHoldingIds: new Set(["h1"])
      })
    ).toBe(true);
    expect(
      canAccessDocument({
        doc: { ownerType: "holding", ownerId: "h2" },
        investorId,
        relatedAssetIds: new Set(),
        ownedHoldingIds: new Set(["h1"])
      })
    ).toBe(false);
  });
  it("allows investor docs only for the owning investor", () => {
    expect(
      canAccessDocument({
        doc: { ownerType: "investor", ownerId: investorId },
        investorId,
        relatedAssetIds: new Set(),
        ownedHoldingIds: new Set()
      })
    ).toBe(true);
    expect(
      canAccessDocument({
        doc: { ownerType: "investor", ownerId: "other" },
        investorId,
        relatedAssetIds: new Set(),
        ownedHoldingIds: new Set()
      })
    ).toBe(false);
  });
});

describe("staffCanAccessAdminDocument", () => {
  it("allows super_admin everything", () => {
    expect(
      staffCanAccessAdminDocument({
        role: "super_admin",
        staffId: "s1",
        doc: { ownerType: "holding", ownerId: "h1" },
        holdingOwner: { assignedAgentId: "other", ibId: "ib1" }
      })
    ).toBe(true);
  });

  it("allows agents asset and platform docs", () => {
    expect(
      staffCanAccessAdminDocument({
        role: "agent",
        staffId: "a1",
        doc: { ownerType: "platform", ownerId: null }
      })
    ).toBe(true);
    expect(
      staffCanAccessAdminDocument({
        role: "agent",
        staffId: "a1",
        doc: { ownerType: "asset", ownerId: "asset-1" }
      })
    ).toBe(true);
  });

  it("scopes holding docs to the agent's assigned investors", () => {
    expect(
      staffCanAccessAdminDocument({
        role: "agent",
        staffId: "a1",
        doc: { ownerType: "holding", ownerId: "h1" },
        holdingOwner: { assignedAgentId: "a1", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      staffCanAccessAdminDocument({
        role: "agent",
        staffId: "a1",
        doc: { ownerType: "holding", ownerId: "h1" },
        holdingOwner: { assignedAgentId: "a2", ibId: "ib1" }
      })
    ).toBe(false);
    expect(
      staffCanAccessAdminDocument({
        role: "agent",
        staffId: "a1",
        doc: { ownerType: "holding", ownerId: "h1" },
        holdingOwner: { assignedAgentId: null, ibId: null }
      })
    ).toBe(false);
  });

  it("scopes investor KYC docs to the assigned agent", () => {
    expect(
      staffCanAccessAdminDocument({
        role: "agent",
        staffId: "a1",
        doc: { ownerType: "investor", ownerId: "inv-1" },
        investorOwner: { assignedAgentId: "a1", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      staffCanAccessAdminDocument({
        role: "agent",
        staffId: "a1",
        doc: { ownerType: "investor", ownerId: "inv-1" },
        investorOwner: { assignedAgentId: "a2", ibId: "ib1" }
      })
    ).toBe(false);
  });

  it("scopes investor and holding docs to the IB's team", () => {
    expect(
      staffCanAccessAdminDocument({
        role: "ib",
        staffId: "ib1",
        doc: { ownerType: "investor", ownerId: "inv-1" },
        investorOwner: { assignedAgentId: "a9", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      staffCanAccessAdminDocument({
        role: "ib",
        staffId: "ib1",
        doc: { ownerType: "investor", ownerId: "inv-2" },
        investorOwner: { assignedAgentId: "a2", ibId: "ib2" }
      })
    ).toBe(false);
    expect(
      staffCanAccessAdminDocument({
        role: "ib",
        staffId: "ib1",
        doc: { ownerType: "holding", ownerId: "holding-1" },
        holdingOwner: { assignedAgentId: "a9", ibId: "ib1" }
      })
    ).toBe(true);
    expect(
      staffCanAccessAdminDocument({
        role: "ib",
        staffId: "ib1",
        doc: { ownerType: "holding", ownerId: "holding-2" },
        holdingOwner: { assignedAgentId: "a2", ibId: "ib2" }
      })
    ).toBe(false);
  });

  it("fails closed when an investor owner cannot be resolved", () => {
    expect(
      staffCanAccessAdminDocument({
        role: "ib",
        staffId: "ib1",
        doc: { ownerType: "investor", ownerId: "inv-3" }
      })
    ).toBe(false);
  });

});

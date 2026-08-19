import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { auditEvents, inviteTokens } from "@/lib/db/schema";

describe("audit_events and invite_tokens indexes (lib/db/schema)", () => {
  it("indexes audit_events by (entity_type, entity_id) for the investor Activity tab", () => {
    const config = getTableConfig(auditEvents);
    const entityIndex = config.indexes.find((entry) => entry.config.name === "audit_events_entity_idx");
    expect(entityIndex).toBeDefined();
    expect(entityIndex?.config.columns.map((column) => ("name" in column ? column.name : undefined))).toEqual([
      "entity_type",
      "entity_id"
    ]);
  });

  it("indexes audit_events by created_at for the admin activity feed ordering", () => {
    const config = getTableConfig(auditEvents);
    const createdAtIndex = config.indexes.find((entry) => entry.config.name === "audit_events_created_at_idx");
    expect(createdAtIndex).toBeDefined();
    expect(createdAtIndex?.config.columns.map((column) => ("name" in column ? column.name : undefined))).toEqual([
      "created_at"
    ]);
  });

  it("indexes invite_tokens by investor_id for invite regeneration", () => {
    const config = getTableConfig(inviteTokens);
    const investorIndex = config.indexes.find((entry) => entry.config.name === "invite_tokens_investor_id_idx");
    expect(investorIndex).toBeDefined();
    expect(investorIndex?.config.columns.map((column) => ("name" in column ? column.name : undefined))).toEqual([
      "investor_id"
    ]);
  });
});
